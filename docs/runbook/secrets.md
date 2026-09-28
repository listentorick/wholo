# Secrets inventory and rotation

> Part of the [live-ops runbook](README.md). **Names and locations only. Never put a secret value in this repo.**

## Where secrets live

- **`helm/wholo/values.live.yaml`** (gitignored, operator's machine) is the source for everything the chart deploys. Helm renders it into Kubernetes Secrets named `wholo-*`.
- **Password manager:** a copy of every value below, plus the account logins. It is the only way back if `values.live.yaml` or the cluster is lost. Keep it updated whenever you rotate something.
- **Outside the cluster:** Cloudflare (Origin CA cert on the WAF, R2 tokens), GitHub (Actions variables), PurelyMail, Xero developer app, ops-host InfluxDB.

There is **no shared JWT secret** in live. BFFs validate Keycloak-issued tokens against Keycloak's JWKS (ADR-049). Portal and admin log in through public Keycloak clients that have no client secret.

## Rules that apply to every rotation

1. **Changing a Secret does not restart the pods that read it.** The app Deployments have no checksum annotation for their Secrets. After `pnpm helm:install:live`, restart the consumers named in the table:
   ```bash
   kubectl -n wholo rollout restart deploy/wholo-<name> [deploy/wholo-<name> …]
   ```
   CronJob pods (the backup job) read Secrets fresh on every run, so they need no restart.
2. **Some values only apply on first boot.** For those, editing `values.live.yaml` changes nothing on its own; change the real thing first (database role, Keycloak console), then update the file to match. They are marked **first-boot** below.
3. Update the password manager in the same sitting.

## Inventory

| Secret | Set in | Rendered into (Secret → key) | Used by | Rotate by | While rotating / if wrong |
|---|---|---|---|---|---|
| Postgres password (**first-boot**) | `postgresql.password` | `wholo-postgresql` → `password`, `url`; `DATABASE_URL` in `wholo-api`, `wholo-admin-api`, `wholo-plausible`; `KC_DB_PASSWORD` in `wholo-keycloak` | postgresql, api, worker, admin-api, keycloak, plausible, backup job | `ALTER ROLE wholo PASSWORD '…'` via `kubectl -n wholo exec deploy/wholo-postgresql -- psql -U wholo -d postgres`, then update values, `helm:install:live`, restart api, worker, admin-api, keycloak, plausible | New connections fail until each consumer restarts, so do it in one go. `POSTGRES_PASSWORD` is only read when the data directory is empty |
| Keycloak admin (**first-boot**) | `keycloak.adminUser` / `adminPassword` | `wholo-keycloak` → `KEYCLOAK_ADMIN*` | Keycloak bootstrap only | Change it in the Keycloak console (master realm → Users → admin → Credentials), then update values to match | Only creates the admin user on an empty database. The value in the file matters again after a [rebuild](disaster-recovery.md) |
| `wholo-api-admin` client secret | `keycloak.apiAdminClientSecret` | realm import (**first-boot**) and `wholo-api` → `KEYCLOAK_ADMIN_CLIENT_SECRET` | worker (disables removed staff in Keycloak, ADR-067) | New value (`openssl rand -hex 32`), set it on the client (Keycloak console → realm → Clients → `wholo-api-admin` → Credentials, or re-run `scripts/setup-keycloak-api-admin-client.sh`, see [setup/keycloak.md](setup/keycloak.md)), update values, `helm:install:live`, restart api and worker | Queued Keycloak disables fail and retry. Staff removal in Stocdup still works |
| App SMTP credentials | `api.smtp.user` / `password` | `wholo-api` → `SMTP_USER`, `SMTP_PASS` | api, worker (order and invite emails) | Change in PurelyMail, update values, `helm:install:live`, restart api and worker | Emails fail and retry |
| Keycloak SMTP credentials (**first-boot**) | `keycloak.smtpUser` / `smtpPassword` | realm import only | Keycloak (verification, password reset) | Keycloak console → realm → Realm settings → Email, then update values to match | Verification and reset emails fail. Re-importing the realm to apply it wipes users ([setup/email.md](setup/email.md)) |
| Marketing SMTP credentials | `www.smtp.user` / `password` | `wholo-www` → `WWW_SMTP_USER`, `WWW_SMTP_PASS` | www register form | Change in PurelyMail, update values, `helm:install:live`, restart www | Lead emails fail |
| R2 media token | `api.r2.accessKeyId` / `secretAccessKey` | `wholo-api` → `R2_*` | api, worker (product images, delivery evidence) | New Cloudflare R2 API token scoped to the media buckets, update values, `helm:install:live`, restart api and worker, **then** revoke the old token | Uploads and signed URLs fail |
| R2 backup token | `postgresql.backup.r2.*` | `wholo-pg-backup` → `r2*` | backup CronJob | New token scoped to `stocdup-db-backups`, update values, `helm:install:live`, run a [manual backup](maintenance.md#backups), then revoke the old token | Backups fail and the backup alert fires |
| Backup encryption password + salt | `postgresql.backup.encryption.*` | `wholo-pg-backup` → `encryptionPassword`, `encryptionSalt` | backup CronJob; needed for **every restore** | Avoid. If you must: keep the **old** pair in the password manager until every backup made with it has aged out (3 days), since restoring those needs the old pair | **Lose both copies and every backup is unrecoverable** |
| Xero client secret | `api.xero.clientSecret` (`clientId` is not secret) | `wholo-api` → `XERO_CLIENT_SECRET` | api, worker (OAuth token exchange and refresh) | Generate a new secret in the Xero developer app, update values, `helm:install:live`, restart api and worker | Xero connect and token refresh fail. Invoice exports fail and retry |
| Accounting token encryption key | `api.accountingTokenEncryptionKey` | `wholo-api` → `ACCOUNTING_TOKEN_ENCRYPTION_KEY` | api, worker (decrypts stored Xero tokens) | **Only if compromised.** Changing it orphans every stored token, so every distributor must reconnect Xero | Must decode to 32 bytes or the api won't start |
| Delivery token signing key | `api.deliveryTokenSigningKey` | `wholo-api` → `DELIVERY_TOKEN_SIGNING_KEY` | api (signs QR delivery links, ADR-059) | New key (`openssl rand -base64 32`), update values, `helm:install:live`, restart api | Links issued before the change stop working. **Empty = forgeable links**; see [Known gaps](#known-gaps) |
| Plausible keys | `plausible.secretKeyBase`, `plausible.totpVaultKey` | `wholo-plausible` | plausible | Only if compromised | Invalidates Plausible sessions and 2FA |
| InfluxDB write token | `telegraf.influx.token` | `wholo-telegraf` → `INFLUX_TOKEN` | telegraf Deployment and `wholo-telegraf-node` DaemonSet | New token in the ops-host InfluxDB (write to `stocdup`), update values, `helm:install:live`, `kubectl -n wholo rollout restart deploy/wholo-telegraf ds/wholo-telegraf-node`, revoke the old token | Metrics gap only |
| GHCR pull secret | `ghcr-pull` (created by hand) | Secret `ghcr-pull` | image pulls | Only needed if the packages are made private (they're public now). New PAT (`read:packages`), recreate the Secret | New pods can't pull images |
| Cloudflare Origin CA cert + key | WAF appliance | — | WAF, for the Cloudflare → WAF leg | Create a new one in Cloudflare → SSL/TLS → Origin Server, install it on the WAF. See [maintenance.md](maintenance.md#certificates) for expiry | Cloudflare 526 errors for every host |

### GHCR pull secret

`values.live.example.yaml` lists `imagePullSecrets: ghcr-pull`, but the GHCR packages are **public**, so leave `imagePullSecrets` unset. If the packages are ever made private, create the Secret as in [setup/cluster.md](setup/cluster.md) (step 5) and set `imagePullSecrets`.

### Not secret, but only in the gitignored file

`healthAccess.allowedIPs` (the monitoring and VPN addresses allowed to reach the health endpoints), the domain, and the pinned image tags. Keep a copy with the password manager entry for `values.live.yaml`.

## Account logins

Keep these in the password manager, with two-factor authentication on where the service offers it:

- Cloudflare: DNS, WAF rules, R2, Origin CA.
- GitHub: repository, Actions variables, GHCR.
- PurelyMail: the three sending addresses.
- Xero developer app: client id and secret, redirect URI.
- The WAF appliance admin login.
- SSH or console access to the three k3s nodes.
- The ops-host InfluxDB and Grafana admins.

## Known gaps

- `values.live.example.yaml` has no placeholders for `api.smtp.user` / `password` or `api.deliveryTokenSigningKey`, even though live needs them.
- **`api.deliveryTokenSigningKey` fails open.** The chart defaults it to `""` and always renders the variable, and `DeliveryTokenSigner` only rejects a *missing* value. If live doesn't set it, the api starts and signs QR delivery links with an empty HMAC key, so anyone can forge a valid link for any order id. Confirm `values.live.yaml` sets a real 32-byte base64 key.
