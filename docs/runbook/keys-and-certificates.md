# Keys, certificates and expiry

> Part of the [live-ops runbook](README.md). Passwords and other secrets that never expire, and how to rotate them: [secrets.md](secrets.md).

Everything live depends on that is a signing key or a certificate, or that can lapse on a date. One section per type. **Expiry dates are not kept in this repo:** each section says how to read the date; record it in the password manager and put a reminder in a calendar.

## Expiry calendar

| Item | Lifetime | Renews itself? | What breaks when it lapses | Section |
|---|---|---|---|---|
| Delivery token keys | No expiry | — | Nothing lapses. Replace only on a schedule you choose, or if the private key is exposed | [Delivery token keys](#delivery-token-keys) |
| Visitor-facing TLS certificates | Short, set by Cloudflare | **Yes**, by Cloudflare | Browsers show a certificate warning on every host | [Visitor-facing TLS](#visitor-facing-tls) |
| Cloudflare Origin CA certificate (on the WAF) | Chosen when created; Cloudflare's default is 15 years | **No** | Cloudflare returns **526** for every host | [Cloudflare Origin CA certificate](#cloudflare-origin-ca-certificate) |
| k3s client and server certificates | **365 days** | Only when k3s **restarts** within 120 days of expiry | `kubectl` stops working; nodes and the control plane stop trusting each other | [k3s cluster certificates](#k3s-cluster-certificates) |
| k3s CA certificates | 10 years | **No** | The whole cluster's trust chain | [k3s cluster certificates](#k3s-cluster-certificates) |
| Operator's `kubeconfig` | Same as the k3s admin certificate it was copied with | **No** — re-copy it | Your `kubectl` and `helm` are refused; the cluster itself is fine | [k3s cluster certificates](#k3s-cluster-certificates) |
| Keycloak token-signing keys | No expiry | — | Nothing lapses | [Keycloak signing keys and sessions](#keycloak-signing-keys-and-sessions) |
| Xero connection (per distributor) | Lapses after **60 days** without a refresh | **Yes**, by the worker | That distributor's sync and invoice export stop until they reconnect | [Xero connection tokens](#xero-connection-tokens) |
| R2, InfluxDB and GHCR access tokens | Whatever was chosen when each was created | **No** | See each row | [Access tokens from other services](#access-tokens-from-other-services) |
| Domain registration and paid accounts | Usually yearly | Only if auto-renew is on and the card works | Everything, for the domain | [Accounts and renewals](#accounts-and-renewals) |
| Postgres, SMTP, Keycloak admin and client passwords; the encryption keys | No expiry | — | Nothing lapses | [secrets.md](secrets.md) |

## Delivery token keys

Every order on a printed manifest has a QR code. It opens the driver app with a link token, `<order id>.<signature>`, and that token is the driver's only credential (ADR-059, ADR-076). The signature is made with an Ed25519 key pair:

| Half | Value in `values.live.yaml` | Secret? | Who gets it | What it can do |
|---|---|---|---|---|
| Private key | `deliveryToken.privateKey` | **Yes** | api and worker (`wholo-api` Secret → `DELIVERY_TOKEN_PRIVATE_KEY`) | Create a link for any order |
| Public keys | `deliveryToken.publicKeys` (a list) | No | api, worker and driver-api (ConfigMaps → `DELIVERY_TOKEN_PUBLIC_KEYS`) | Check a link. Cannot create one |

The driver app checks the token on every request before it reads anything else, and the api checks it again. A link is accepted if **any** key in the list verifies it. That is what lets a key be replaced without killing links already printed: for a while the list holds both the new key and the old one.

These are plain keys, not certificates. Nothing expires and there is no authority to renew with.

**Replacing the keys does not break QR codes already printed,** provided the old public key stays in the list. Manifests printed in the morning still open after a replacement that afternoon. Printed codes stop working only when the old public key is *removed*, which is a separate step you take later, when you choose, and can undo.

### Generate a pair

On your own machine, from the repo:

```bash
scripts/generate-delivery-token-keys.sh
```

It prints a `deliveryToken:` block ready to paste into `values.live.yaml`, and writes nothing to disk. Put the private key in the password manager in the same sitting, then clear the terminal. **Never reuse a pair between environments**, and never commit one.

To check that a private key and a public key belong together (the output must equal the public key):

```bash
echo '<privateKey>' | base64 -d | openssl pkey -inform DER -pubout -outform DER | base64 | tr -d '\n'
```

### First-time setup

The chart will not render without both values, and the api and driver-api will not start without valid ones. Before the first deploy of a release that includes ADR-076:

1. Generate a pair and paste the block into `values.live.yaml` (remove `api.deliveryTokenSigningKey` if it is there; it is no longer read).
2. Save the private key in the password manager.
3. Deploy as normal ([deploy.md](deploy.md)).

Links printed before that deploy stop working. Reprint the manifest for any run not yet delivered.

### Replace the keys on a schedule (no downtime)

Do the steps in this order. Changing a ConfigMap or Secret does not restart the pods that read it, so each step names the restarts.

1. **Trust the new key.** Generate a new pair. Add its public key as the **first** entry in `deliveryToken.publicKeys`, leaving the old one below it. Do **not** change `privateKey` yet.
   ```bash
   pnpm helm:install:live
   kubectl -n wholo rollout restart deploy/wholo-api deploy/wholo-worker deploy/wholo-driver-api
   kubectl -n wholo rollout status deploy/wholo-driver-api --timeout=5m
   ```
2. **Sign with the new key.** Set `deliveryToken.privateKey` to the new private key. Update the password manager.
   ```bash
   pnpm helm:install:live
   kubectl -n wholo rollout restart deploy/wholo-api deploy/wholo-worker
   ```
   Manifests printed from now on use the new key. Manifests printed earlier still open. **Write down the time, in UTC** (`date -u '+%Y-%m-%d %H:%M:%S'`); step 3 needs it.
3. **Wait** until no deliveries are outstanding on a manifest printed before step 2. There is no deadline: the old public key can stay in the list for days or weeks. Check with the query below, giving it the time from step 2:
   ```bash
   kubectl -n wholo exec -i deploy/wholo-postgresql -- psql -U wholo -d wholo \
     -v switched_at='<YYYY-MM-DD HH:MM:SS, UTC>' < scripts/delivery-links-outstanding.sql
   ```
   PowerShell has no `<` redirect; pipe instead: `Get-Content scripts/delivery-links-outstanding.sql -Raw | kubectl -n wholo exec -i deploy/wholo-postgresql -- psql -U wholo -d wholo -v switched_at='<time>'`.

   It lists each run whose manifest was printed with the old key and still has deliveries to record. **Go on to step 4 only when it returns no rows.** A run you no longer expect to be delivered from that paper can be cleared by reprinting its manifest and replacing the driver's copy; it stays in the list until its deliveries are recorded, so judge those by eye.
4. **Stop trusting the old key.** Remove the old public key from the list, but **keep a copy of it** with the password manager entry.
   ```bash
   pnpm helm:install:live
   kubectl -n wholo rollout restart deploy/wholo-api deploy/wholo-worker deploy/wholo-driver-api
   ```

If you do steps 1 and 2 in a single deploy, new links fail in the driver app until it has been restarted with the new list. Keeping them separate avoids that.

**If the old key was removed too early** and drivers report QR codes that say "not found": put the old public key back in `deliveryToken.publicKeys`, deploy, and restart api, worker and driver-api. The same printed codes work again. A public key is not secret, which is why step 4 says to keep it.

### Replace the keys in an emergency (private key exposed)

Anyone holding the private key can create a link for any order. Do not keep the old key trusted.

1. Generate a new pair. Set `deliveryToken.privateKey` to the new private key and `deliveryToken.publicKeys` to **only** the new public key.
2. Deploy and restart all three:
   ```bash
   pnpm helm:install:live
   kubectl -n wholo rollout restart deploy/wholo-api deploy/wholo-worker deploy/wholo-driver-api
   ```
3. **Every link already printed stops working.** Reprint the manifest for each run not yet delivered and get it to the driver.
4. Update the password manager. Review the audit log for delivery outcomes recorded while the key was exposed (action `DELIVERY_OUTCOME_RECORDED`).

### Confirm it worked

```bash
# a made-up token is refused at the edge
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Delivery-Token: order.forged' https://driver.<domain>/api/v1/delivery-links   # 404
```

Then print a manifest from the admin app and open one of its links on a phone: the delivery page loads.

### If it is wrong

| Symptom | Cause |
|---|---|
| `helm` fails with `deliveryToken.privateKey is required` or `deliveryToken.publicKeys is required` | A value is missing from `values.live.yaml` |
| `wholo-api` or `wholo-worker` in `CrashLoopBackOff`, log says `DELIVERY_TOKEN_PRIVATE_KEY is …` or `DELIVERY_TOKEN_PUBLIC_KEYS entry N is …` | A value is empty, cut short, or not the generator's output |
| Same pods crash with `DELIVERY_TOKEN_PUBLIC_KEYS does not include the public half of DELIVERY_TOKEN_PRIVATE_KEY` | The private key was changed before its public key was added to the list (step 1 was skipped) |
| `wholo-driver-api` in `CrashLoopBackOff` with a `DELIVERY_TOKEN_PUBLIC_KEYS` message | Same causes, for the driver app |
| Every delivery link shows "not found", pods healthy | The driver app was not restarted after the list changed |
| Links on older manifests show "not found", newer ones work | The old public key was removed while its manifests were still out. Put it back (see above) |

```bash
kubectl -n wholo logs deploy/wholo-api -c api --tail=30
kubectl -n wholo logs deploy/wholo-driver-api --tail=30
```

## Visitor-facing TLS

The certificates browsers see are Cloudflare edge certificates. Cloudflare issues and renews them. There is nothing to do.

To confirm they are still being managed: Cloudflare → SSL/TLS → Edge Certificates shows the certificate for `<domain>` and `*.<domain>` as **Active**, with a managed renewal.

## Cloudflare Origin CA certificate

This certificate sits on the WAF appliance and secures the leg from Cloudflare to the WAF. **It does not renew itself.** Its lifetime was chosen when it was created; Cloudflare's default is 15 years.

- **Read the expiry date:** Cloudflare → SSL/TLS → Origin Server lists each origin certificate with its expiry. Record the date in the password manager entry.
- **When it lapses:** Cloudflare returns **526** for every host.
- **Replace it:** Cloudflare → SSL/TLS → Origin Server → Create Certificate (`*.<domain>`), then install the new certificate and key on the WAF. Setup detail: [setup/cluster.md](setup/cluster.md).

## k3s cluster certificates

k3s issues its own certificates so that the control plane, the nodes and `kubectl` can trust each other. They are separate from anything the apps use, and they are the certificates most likely to catch an untouched cluster out.

Per the k3s documentation ([Certificate management](https://docs.k3s.io/cli/certificate)):

- **Client and server certificates are valid for 365 days.** They are renewed automatically **only when k3s starts**, and only if they are expired or within 120 days of expiring (90 days on k3s releases before May 2025).
- **CA certificates are valid for 10 years** and are never renewed automatically.

So a cluster where k3s has not restarted for a year lets its certificates expire. Anything that restarts k3s in the last 120 days renews them: an upgrade ([maintenance.md → Upgrading k3s](maintenance.md#upgrading-k3s)), a node reboot, or a restart of the service.

**Check the dates** (on a node, as root):

```bash
k3s certificate check --output table
```

k3s also raises a Kubernetes warning event when a certificate is within the renewal window:

```bash
kubectl get events -A --field-selector reason=CertificateExpirationWarning
```

**Renew them.** If the check shows less than 120 days left, restarting k3s is enough. Do one node at a time, with the same care as a reboot ([maintenance.md → Rebooting or patching a node](maintenance.md#rebooting-or-patching-a-node)):

```bash
sudo systemctl restart k3s          # on a server node; agents use k3s-agent
k3s certificate check --output table
```

To force new certificates at any time, on the node:

```bash
sudo systemctl stop k3s
sudo k3s certificate rotate
sudo systemctl start k3s
```

**Your `kubeconfig` expires too.** It was copied from a node and carries a client certificate with the same 365-day life. When it lapses, `kubectl` and `helm` on your machine are refused even though the cluster is healthy. After the certificates have been renewed, copy the kubeconfig from the server node again (`/etc/rancher/k3s/k3s.yaml`), and put the node's address back in place of `127.0.0.1`.

How k3s was installed on these nodes is not documented yet ([maintenance.md](maintenance.md#upgrading-k3s)); confirm the service names above against the nodes the first time you do this, and correct this page if they differ.

## Keycloak signing keys and sessions

Keycloak signs every login token with the realm's own keys. The api and the admin and portal apps check tokens against Keycloak's published public keys (ADR-049).

- **The signing keys do not expire and do not rotate on their own.** See them in the Keycloak console → realm → Realm settings → Keys.
- **Replacing them signs everyone out.** If you add a new key with a higher priority and disable the old one, every existing token stops being accepted and all users log in again. Do it only if a key is compromised.
- **What does expire is each user's session,** by design. From the realm import: access tokens last 15 minutes and are refreshed silently; a session lasts 30 days, after which the user logs in again.

## Xero connection tokens

Each distributor connects their own Xero organisation. Stocdup stores an access token and a refresh token for that connection, encrypted.

- **Access tokens** last about 30 minutes and are refreshed automatically whenever they are needed.
- **A refresh token lapses if it is not used for 60 days.** The worker prevents this: once a day it refreshes any connection that has not been refreshed for 25 days.
- **When it lapses anyway** (the worker was down for weeks, or the distributor revoked access in Xero), that connection moves to an error state. The distributor is notified in the admin app and by email, and must reconnect Xero from the Integrations page. Sync and invoice export for that distributor fail until they do. Other distributors are unaffected.
- **The Xero client secret** (`api.xero.clientSecret`) identifies Stocdup's app to Xero. Check in the Xero developer portal whether the current secret has an expiry, and record it. If it stops being accepted, **every** distributor's refresh fails at once, and reconnecting does not help. The api and worker log `accounting.connection.invalid_client` at error level for it. Rotating it: [secrets.md](secrets.md).

## Access tokens from other services

Each of these is a token another service issued. Whether it expires depends on what was chosen when it was created, so **check each one once and record the date**.

| Token | Where to see its expiry | When it lapses |
|---|---|---|
| R2 media token (`api.r2.*`) | Cloudflare → R2 → Manage API tokens | Image uploads and signed image links fail |
| R2 backup token (`postgresql.backup.r2.*`) | Cloudflare → R2 → Manage API tokens | Backups fail and the backup alert fires |
| InfluxDB write token (`telegraf.influx.token`) | Ops-host InfluxDB → Load Data → API Tokens | A gap in metrics; nothing user-facing |
| GHCR pull token (`ghcr-pull` Secret) | GitHub → Settings → Developer settings → Personal access tokens | Only matters if the image packages are made private: new pods cannot pull images |

Replacing each one: [secrets.md](secrets.md).

## Accounts and renewals

Not secrets, but they lapse on a date and take the platform with them:

- **The domain registration.** If it lapses, every host stops resolving. Check the renewal date and that auto-renew is on with a working payment method, at the registrar.
- **Cloudflare, PurelyMail and any other paid account** in [secrets.md → Account logins](secrets.md#account-logins). A failed payment can suspend DNS, the edge, storage or email.

Record each renewal date alongside the login in the password manager.
