# Live environment — self-hosted k3s

Topology and rationale: [ADR-048](../adrs/ADR-048-live-environment-k3s.md).

- Cluster: 3 nodes — `k3s-00` (control-plane, schedulable), `k3s-01`, `k3s-02`. ~2 CPU / 4 GiB RAM / 22 GiB disk each.
- Storage: `local-path` only (node-local, ReclaimPolicy **Delete** — `helm uninstall` destroys data; PVC deletion is unrecoverable).
- Edge: Cloudflare (proxied DNS, edge TLS, WAF rules, SSL mode **Full (strict)**) → on-prem WAF appliance (terminates the Cloudflare leg with a Cloudflare Origin CA cert) → bundled Traefik over **plain HTTP :80** (`ingress.tls: false`; Traefik trusts the WAF's `X-Forwarded-Proto` via `deploy/live/traefik-config.yaml`). No cert-manager / Let's Encrypt.
- Traefik runs as a DaemonSet, one pod per node labelled `svccontroller.k3s.cattle.io/enablelb=true` (all 3 nodes currently), with `externalTrafficPolicy: Local` so the real client IP always reaches Traefik regardless of which node a request lands on — see `deploy/live/traefik-config.yaml`.
- Images: GHCR packages (currently public — pods pull anonymously, no pull secret; if made private, create the `ghcr-pull` secret and set `imagePullSecrets` per values.live.example.yaml), published by the `build-images` GitHub Actions workflow on every push to `master` (tags `sha-<shortsha>` + `latest`). Always deploy a pinned `sha-` tag.
- Live config: `helm/wholo/values.live.yaml` (gitignored) — copy from `values.live.example.yaml`.

## One-time GitHub setup

1. Repository → Settings → Secrets and variables → Actions → **Variables**:
   - `LIVE_KEYCLOAK_URL` = `https://auth.<domain>`
   - `LIVE_KEYCLOAK_REALM` — MUST equal `keycloak.realm` in values.live.yaml
     (the realm the chart imports); the browser bundles bake this name and
     Keycloak 404s the login page if they disagree.

   These are baked into the portal/admin JS bundles at image build time, so
   they must be set **before** the images you intend to deploy are built.
   - Marketing site (`apps/www`) build args, also baked at image build time
     (all optional — omit to ship analytics off and a single hero):
     - `WWW_PLAUSIBLE_ENABLED` = `1` to load the analytics script
     - `WWW_PLAUSIBLE_DOMAIN` = `<domain>` (the Plausible site name; defaults
       to `stocdup.com`)
     - `WWW_EXPERIMENT_HERO_VARIANTS` = e.g. `growth,operations` to turn on
       the hero A/B split (blank ⇒ `/` stays static, single hero)
2. Push to `master` (or run the `build-images` workflow manually) and confirm
   the five packages appear:
   `ghcr.io/listentorick/wholo/{api,portal-api,admin-api,keycloak,www}`.

## One-time cluster setup

1. **DNS / Cloudflare** — zone on Cloudflare (nameservers delegated from the
   registrar). A records for `www.`, `portal.`, `admin.`, `auth.<domain>` →
   the WAF's public IP, all **Proxied** (`apps/api` gets no public host —
   BFFs reach it over cluster DNS). Cloudflare settings: SSL/TLS mode
   **Full (strict)**, **Always Use HTTPS** on.
   - The bare apex `<domain>` is **not** served by the cluster (the WAF's
     Cloudflare Origin CA cert is `*.<domain>`, which does not cover the
     apex). Add a proxied A record for `<domain>` (any address — Cloudflare
     never connects to it) plus a **Redirect Rule**: *When incoming host
     equals `<domain>` → 301 to `https://www.<domain>${uri.path}`*.

2. **WAF appliance** (in front of the cluster; terminates TLS) — install a
   Cloudflare **Origin CA certificate** (dashboard: SSL/TLS → Origin Server →
   Create Certificate, `*.<domain>`) as its server cert; upstream = k3s
   node(s) port **80** plain HTTP; preserve the `Host` header; send
   `X-Forwarded-Proto: https`; accept inbound 443 only from
   [Cloudflare's IP ranges](https://www.cloudflare.com/ips/).

3. **Traefik node placement + forwarded-headers trust** — label every node
   that should run ingress traffic (currently all 3; this is also the label
   k3s's own ServiceLB uses to decide which nodes it exposes at all, so
   labelling a node here is what makes it an "ingress node"):
   ```bash
   kubectl label node k3s-00 svccontroller.k3s.cattle.io/enablelb=true
   kubectl label node k3s-01 svccontroller.k3s.cattle.io/enablelb=true
   kubectl label node k3s-02 svccontroller.k3s.cattle.io/enablelb=true
   ```
   Then fill the WAF's internal IP into `deploy/live/traefik-config.yaml` and
   apply it:
   ```bash
   kubectl apply -f deploy/live/traefik-config.yaml
   ```
   This runs Traefik as a DaemonSet (one pod per labelled node) with
   `externalTrafficPolicy: Local`, so every ingress node serves traffic from
   its own local pod and Traefik always sees the real client IP — required
   for the `healthAccess.allowedIPs` allowlist to hold regardless of which
   node a request lands on. If a node is later added to or removed from the
   cluster's ingress-facing set, re-run the matching `kubectl label` command
   for it (`...enablelb-` to remove).

4. **Namespace**
   ```bash
   kubectl create namespace wholo
   ```

5. **GHCR pull secret** — only if the packages are made private (they are
   currently public; skip this and leave `imagePullSecrets` unset). Create a
   GitHub PAT (classic) with `read:packages`:
   ```bash
   kubectl -n wholo create secret docker-registry ghcr-pull \
     --docker-server=ghcr.io \
     --docker-username=listentorick \
     --docker-password=<PAT>
   ```

6. **Values**
   ```bash
   cp helm/wholo/values.live.example.yaml helm/wholo/values.live.yaml
   ```
   Fill in the domain, strong passwords, R2 credentials, and a pinned
   `sha-` image tag from the latest `build-images` run.

## Deploy

```bash
helm upgrade --install wholo helm/wholo -n wholo -f helm/wholo/values.live.yaml
```

- Prisma migrations run automatically in the api pod's `migrate` initContainer.
- The demo seed job and Keycloak demo users are **disabled** in live.
- Upgrades: bump the `sha-` tags in values.live.yaml and rerun the same
  command. Postgres/Redis restart via `Recreate` (brief downtime by design);
  the app deployments roll with zero downtime.

## First-run bootstrap (no seed data)

1. Log into the Keycloak admin console at `https://auth.<domain>` with
   `keycloak.adminUser`/`adminPassword` from values.live.yaml.
2. In the app realm (`keycloak.realm` from values.live.yaml), create the
   first real user (email as username).
3. Create the distributor organisation and membership for that user via the
   API (or directly in the database) — the user's Keycloak `sub` is resolved
   to organisation/role through the `Membership` table on first login.

## Keycloak realm caveat

`--import-realm` only imports the realm on **first boot**. Later changes to
`keycloak.adminClientUrl` / `portalClientUrl` (redirect URIs) in values do not
propagate to an existing installation — change them in the Keycloak admin
console instead, or delete and re-import the realm.

## Email

Live sends real mail via PurelyMail (`smtp.purelymail.com`, port 587
STARTTLS), configured through `api.smtp.*` and `keycloak.smtp*` in
values.live.yaml. Two From addresses, both on the `stocdup.com` domain so a
single SPF/DKIM/DMARC setup in Cloudflare covers both:

- `notifications@stocdup.com` — `apps/api` order/invite emails (`api.smtp.*`)
- `noreply@stocdup.com` — Keycloak account emails: verification, password
  reset (`keycloak.smtp*`, `smtpFrom` decoupled from `api.smtp.from`)

Keycloak's realm import only applies on first boot, so changing
`keycloak.smtp*` values after the realm already exists requires forcing a
re-import: drop just Keycloak's own database (not the main `wholo` app
database) and restart its pod —

```bash
kubectl exec -n wholo -it deploy/wholo-postgresql -- psql -U wholo -d wholo -c "DROP DATABASE keycloak;"
kubectl rollout restart deployment/wholo-keycloak -n wholo
```

— which deletes existing realm users/sessions, so only do this when that's
acceptable (e.g. only test/seed users exist).

MailHog is still deployed (ClusterIP-only, ClusterIP ⇒ no public exposure)
as a fallback/local-dev parity fixture, but nothing points at it in live
anymore. UI: `kubectl -n wholo port-forward svc/wholo-mailhog 8025:8025`.

The marketing site's register-interest form sends its own mail (own
`nodemailer`, not `apps/api`'s module) via `www.smtp.*` in values.live.yaml —
same PurelyMail account, ideally a dedicated `leads@stocdup.com` sender, to
`www.leadsTo`. See below.

## Marketing site + analytics (ADR-060)

`apps/www` (`www.<domain>`) is a standalone Next.js site — no BFF, no DB. Its
only backends are SMTP (lead emails) and a self-hosted Plausible it proxies
first-party.

**values.live.yaml** needs a `www:` block and a `plausible:` block (see
`values.live.example.yaml`):

- `www.image.tag` — bump the `sha-` tag alongside the others each promote.
- `www.siteUrl: https://www.<domain>`.
- `www.smtp.*` — the lead-email transport (`www.smtp.from` is the sender,
  `www.smtp.leadsTo` the internal recipient; real password in the gitignored
  values.live.yaml).
- `ingress.hosts.www: www.<domain>` — renders the Traefik IngressRoute.
- `plausible.enabled: true`, `plausible.baseUrl: https://www.<domain>`.
- `plausible.secretKeyBase` (`openssl rand -base64 64`) and
  `plausible.totpVaultKey` (`openssl rand -base64 32`) — generate once, keep
  stable (rotating them invalidates sessions / 2FA).

Enabling `plausible` also brings up `wholo-clickhouse` (its event store, a
PVC on node-local storage — same backup caveat as Postgres). Plausible's app
DB is a separate `plausible` database on the shared Postgres, created by the
deployment's `migrate` initContainer.

**Analytics only records anything if the `www` image was built with
`WWW_PLAUSIBLE_ENABLED=1`** (see GitHub setup above) — the Helm flag just
runs the server.

**Plausible dashboard** (no ingress — reach it by port-forward):

```bash
kubectl -n wholo port-forward svc/wholo-plausible 8000:8000
# browse http://localhost:8000 — first visit creates the admin user
# (registration is invite-only after that: plausible.disableRegistration)
```

Add the site (`<domain>`, matching `WWW_PLAUSIBLE_DOMAIN`) in the dashboard
on first run.

## Backups

A nightly CronJob (`postgresql.backup.enabled`) runs `pg_dumpall` (captures
both the `wholo` and `keycloak` databases) to the `wholo-pg-backups` PVC,
keeping the newest 7 dumps.

```bash
# manual backup now
kubectl -n wholo create job pg-backup-manual --from=cronjob/wholo-pg-backup

# list dumps
kubectl -n wholo run -it --rm ls-backups --image=postgres:16-alpine \
  --overrides='{"spec":{"containers":[{"name":"ls-backups","image":"postgres:16-alpine","command":["ls","-lh","/backups"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}],"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"wholo-pg-backups"}}]}}'

# restore (DESTRUCTIVE — restores every database from the dump)
gunzip -c wholo-<ts>.sql.gz | kubectl -n wholo exec -i deploy/wholo-postgresql -- psql -U wholo -d postgres
```

**Limitations**: dumps live on the same cluster's node-local storage. This
protects against application-level corruption and accidental deletion, not
node-disk loss. Copying dumps off-cluster (scp/rclone cron on a node, or a
push to R2) is a recommended follow-up.

## Verification checklist (after deploy)

1. `kubectl -n wholo get pods` — all Running/Ready.
2. `curl -sI https://portal.<domain>/` → response with a valid Cloudflare
   edge cert (no `-k` needed); `curl -sI http://portal.<domain>/` → 301 to
   https (edge "Always Use HTTPS").
3. Browse `https://admin.<domain>` → redirected to `auth.<domain>` → log in →
   redirected back (proves baked NEXT_PUBLIC URL, realm redirect URIs, and
   JWKS validation agree). Repeat for the portal.
   - `https://www.<domain>/` serves the landing page; `https://<domain>/`
     301s to it. Submit the register form → the lead email reaches
     `www.smtp.leadsTo`. If analytics is on, a pageview appears in the
     port-forwarded Plausible dashboard (and `curl -sI https://www.<domain>/js/script.js`
     → 200 from the first-party proxy).
4. Trigger any email flow; confirm it lands in MailHog with `https://` links.
5. `kubectl -n wholo logs deploy/wholo-worker` — queue consumers up, exactly
   1 replica (ADR-047: the outbox relay must be the only publisher).
6. Run a manual backup job and check a dump appears.
