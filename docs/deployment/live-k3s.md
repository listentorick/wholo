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

## Keycloak service-account client (team removal)

Removing a team member (Team page → **Remove from team**) revokes their access
in Stocdup immediately, and the worker then **disables their Keycloak login** so
they can't sign in at all (ADR-067). That call uses a dedicated service-account
client, `wholo-api-admin`, which holds only `realm-management: manage-users`.

- **Fresh realm:** created by the realm import from
  `keycloak.apiAdminClientSecret` — nothing to do beyond setting that value in
  `values.live.yaml` (`openssl rand -hex 32`).
- **Existing realm** (import is first-boot-only, so this applies to every
  environment that existed before this feature): run once, then redeploy so
  the api/worker pick up the secret:

  ```bash
  kubectl port-forward svc/wholo-keycloak 3080:3080 -n wholo &
  CLIENT_SECRET='<keycloak.apiAdminClientSecret from values.live.yaml>' \
  REALM=<your realm, e.g. prod> KEYCLOAK_ADMIN=<admin user> KEYCLOAK_ADMIN_PASSWORD=<admin password> \
  scripts/setup-keycloak-api-admin-client.sh
  ```

  Idempotent; it ends by proving the client can obtain a token. Until the
  client exists, removal still works in Stocdup (the person is locked out at
  the API), but the queued Keycloak disables retry and fail — check the worker
  logs for `KEYCLOAK_ADMIN_CLIENT_SECRET` / `Keycloak could not …`.

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

## Order-activity telemetry (ADR-062)

`apps/api` emits two StatsD counters over UDP on every successfully submitted
order (`stocdup_orders_submitted`, `stocdup_order_value_minor`). In live only
**Telegraf** runs in-cluster — it forwards to the **InfluxDB 2** and **Grafana**
already running on the ops monitoring host (`influxdb.home.arpa`, `grafana.home.arpa`). Stocdup holds no
InfluxDB credentials; the flow can never fail or slow an order.

**values.live.yaml** needs an `appEnv` + `telegraf` block (see
`values.live.example.yaml`); leave `influxdb.enabled` / `grafana.enabled` false:

- `appEnv: "live"` — becomes the `environment` tag on every metric.
- `telegraf.enabled: true`, `telegraf.image` — bump alongside the others is not
  needed (upstream image, not CI-built).
- `telegraf.influx.url: http://influxdb.home.arpa:8086` — the ops-host InfluxDB.
- `telegraf.influx.org: Parsnips`, `telegraf.influx.bucket: stocdup`.
- `telegraf.influx.token` — a write token (see step 3 below); real value goes in
  the gitignored `values.live.yaml`, not the example.

**One-time infra-owner setup on the ops host:**

1. InfluxDB: org `Parsnips`, bucket `stocdup` (retention e.g. `90d`). The bucket
   name must be `stocdup` — the committed dashboards and alert rules query it
   by that name.
2. Confirm pods can resolve **and** reach the ops host — `home.arpa` names are
   resolved by the node's DNS via CoreDNS, and egress ≠ ingress:
   `kubectl -n wholo run netcheck --rm -it --restart=Never --image=busybox -- sh -c 'nslookup influxdb.home.arpa && wget -qO- http://influxdb.home.arpa:8086/health'`
3. InfluxDB: create an API token scoped to **write** `stocdup` (add read
   too if the same token backs Grafana). Put it in `values.live.yaml` as
   `telegraf.influx.token`.
4. Grafana (`http://grafana.home.arpa:3000`): add an InfluxDB data source —
   URL `http://influxdb.home.arpa:8086`, query language **Flux**, org
   `Parsnips`, default bucket `stocdup`, token from step 3.
5. Grafana: Dashboards → Import → paste
   `helm/wholo/dashboards/stocdup-order-activity.json`, pick the data source from
   step 4. This is the same file auto-provisioned into the local Grafana; there
   is no automation for the external instance — re-import on change.

**Verify after deploy:** `kubectl -n wholo logs deploy/wholo-telegraf` shows the
statsd input + influxdb_v2 output loaded with no write errors; submit a real
order; the point appears on the ops-host Grafana dashboard within ~15s.

## Core platform-health metrics (ADR-063 / ADR-065)

Layered on the same Telegraf → ops-host InfluxDB path. Enabled by
`telegraf.platformHealth.enabled: true` in `values.live.yaml` (already in
`values.live.example.yaml`). When on, `helm upgrade` additionally creates:

- **five `ClusterIP` Services** `wholo-{api,admin-api,portal-api,driver-api,worker}-metrics`
  on port `9464`. Each process serves its HTTP request/latency and (worker)
  BullMQ queue metrics there as Prometheus text at `/metrics` (ADR-065), and
  the Telegraf Deployment scrapes them with `inputs.prometheus` every 15s. The
  port is never on an app's own Service or an ingress route — cluster-internal
  only, no new egress. (Order-activity counters and backup gauges still arrive
  over StatsD/UDP.)

- a read-only **ClusterRole + ClusterRoleBinding + ServiceAccount**
  (`wholo-telegraf`) — the chart's first RBAC — so the Telegraf Deployment's
  `inputs.kube_inventory` can read pod status / restarts and node objects;
- a **`wholo-telegraf-node` DaemonSet** — one Telegraf per node for node
  CPU/memory/disk %, with **read-only** hostPath mounts of `/proc` + `/sys`.
  **Not** privileged, no `securityContext` escalation, **no** kubelet / `:10250`
  dependency. If a PodSecurity policy is ever enforced on the `wholo` namespace
  it must allow `hostPath` volumes for this DaemonSet.

The Telegraf Deployment also gains 4 `inputs.http_response` self-checks against
the in-cluster `/api/v1/health` Services (no egress). Reuses the same
`telegraf.influx.*` write token — no extra ops-host setup beyond the bucket that
already exists.

**One-time infra-owner step:** Grafana → Dashboards → Import → paste
`helm/wholo/dashboards/stocdup-platform-health.json`, pick the same Flux data
source. Same file auto-provisioned locally; re-import on change.

**Verify after deploy:**
`kubectl -n wholo logs deploy/wholo-telegraf` shows `inputs.prometheus`,
`inputs.http_response` + `inputs.kube_inventory` loaded with **no `forbidden`**
and no `connection refused` / `error making HTTP request` lines;
`kubectl -n wholo exec deploy/wholo-api -- wget -qO- localhost:9464/metrics | head`
returns `stocdup_http_requests_total` lines (repeat for `deploy/wholo-worker` →
`stocdup_queue_jobs`);
`kubectl -n wholo logs ds/wholo-telegraf-node` shows `inputs.cpu`/`mem`/`disk`
loaded; `kubectl auth can-i list pods --as=system:serviceaccount:wholo:wholo-telegraf`
returns `yes`; the "Stocdup Platform Health" dashboard populates within ~30s.

## Log aggregation (ADR-064)

Every pod's logs → Loki on the ops host. Only Fluent Bit runs in-cluster (a
`wholo-fluent-bit` DaemonSet, one per node, tailing `/var/log/containers`).

**values.live.yaml** (see `values.live.example.yaml`):

- `fluentBit.enabled: true`
- `fluentBit.loki.host: "loki.home.arpa"` (port `3100`, uri `/loki/api/v1/push`)
- `loki.enabled: false` — Loki is external (the in-cluster single-binary Loki is
  local-dev only).
- Optionally `logging.level: "warn"` to cut boot-log noise across the 5 Node
  processes (default `info`).

`helm upgrade` also creates the chart's second RBAC set (`wholo-fluent-bit` SA +
a read-only `pods`/`namespaces` ClusterRole) and the DaemonSet, which mounts
`/var/log/pods` + `/var/log/containers` **read-only** plus a writable
`/var/lib/wholo-fluent-bit` hostPath for its position DB. Not privileged.

**One-time infra-owner setup on the ops host:**

1. Run Loki (or point at an existing one). Set a retention period; storage
   backend (filesystem / object store) and sizing are the ops host's call.
2. Confirm the k3s nodes — **including the schedulable control-plane node** — can
   resolve and reach `loki.home.arpa:3100` (same `netcheck` pod as above, with
   `wget -qO- http://loki.home.arpa:3100/ready`; egress ≠ ingress; the `healthAccess` allowlist is
   inbound — check the ops firewall accepts inbound `:3100` from the cluster).
3. Grafana: add a **Loki** data source, url `http://loki.home.arpa:3100`.
4. Grafana: Dashboards → Import → paste `helm/wholo/dashboards/stocdup-logs.json`,
   pick the Loki data source. Same file auto-provisioned locally; re-import on
   change. (Grafana → Explore → Loki is the primary tool.)

**Verify after deploy:** `kubectl -n wholo logs ds/wholo-fluent-bit` shows the
`loki` output loaded with no repeated `connection refused` / `could not flush`;
`kubectl -n wholo logs deploy/wholo-api | head` is single-line JSON;
`{namespace="wholo"}` in the ops Grafana Explore returns lines within ~15s.

## Backups

Encrypted, off-cluster Postgres backups ([ADR-069](../adrs/ADR-069-offsite-encrypted-postgres-backups.md)).
**Restore procedure: [postgres-backup-restore.md](postgres-backup-restore.md).**

| | |
|---|---|
| What | A full `pg_dumpall` (every database: `wholo`, `keycloak`, `plausible`), gzip-compressed. Each backup is complete and independent — no incrementals, no WAL. |
| Schedule | Every 6 hours, `0 */6 * * *` (`postgresql.backup.schedule`) — recovery point is up to 6h. CronJob `wholo-pg-backup`, `concurrencyPolicy: Forbid`, one retry, 1h deadline. |
| Storage | Cloudflare R2 bucket `stocdup-db-backups`, key prefix `postgres/`, objects named `wholo-<UTC yyyymmddThhmmssZ>.sql.gz.bin`. Nothing is written to node disk; there is no backup PVC. |
| Encryption | In the CronJob, before upload, via an rclone `crypt` remote (NaCl secretbox, authenticated). R2 only ever holds ciphertext. The password + salt are in the `wholo-pg-backup` Secret **and in the password manager** — without them a backup cannot be restored. |
| Verification | Every run reads the object back through the crypt remote and checks it decrypts, gunzips and ends with pg_dumpall's completion trailer. A run that fails deletes its partial object. |
| Retention | 3 days (~12 backups), enforced by an R2 lifecycle rule on the bucket — not by the chart. |
| Monitoring | StatsD gauges → Telegraf → ops InfluxDB: `stocdup_backup_last_run_ts`, `_last_outcome`, `_last_success_ts`, `_size_bytes`, `_duration_s`. Grafana dashboard "Stocdup Backups" (`helm/wholo/dashboards/stocdup-backups.json`). |
| Alerts | "Postgres backup failed" (last attempt failed) and "Postgres backup stale" (newest successful backup older than **13h**, i.e. two missed runs; no data counts as firing). Definitions: `helm/wholo/alerting/stocdup-backups.yaml`. |

The job runs in the Postgres image itself (so `pg_dumpall` matches the server
version); an initContainer copies the static `rclone` binary in from the pinned
`rclone/rclone` image. Postgres' own Deployment, config and data PVC are
untouched.

**One-time setup:**

1. Cloudflare → R2 → create bucket `stocdup-db-backups` (location hint near the
   k3s node; default storage class).
2. Bucket → Settings → Object lifecycle rules → add: prefix `postgres/`, delete
   objects **3 days** after upload. (Also: abort incomplete multipart uploads
   after 1 day.)
3. R2 → Manage API tokens → create a token with **Object Read & Write**,
   **applied to `stocdup-db-backups` only**. Note the access key id + secret and
   the account id.
4. Generate the encryption password and salt — `openssl rand -base64 32`, one
   each. Store **both in the password manager** (with the bucket name and
   account id) before putting them in `values.live.yaml`.
5. `values.live.yaml` → `postgresql.backup.r2.*` and `postgresql.backup.encryption.*`
   (see `values.live.example.yaml`).
6. Ops Grafana → Dashboards → Import → `helm/wholo/dashboards/stocdup-backups.json`,
   pick the Flux data source.
7. Ops Grafana → Alerting → create the two rules from
   `helm/wholo/alerting/stocdup-backups.yaml` (same Flux queries, reduce `last`,
   thresholds `> 13` and `< 1`, no-data state as in the file), in folder
   Stocdup, routed by the default notification policy. Alternatively POST each
   rule to `/api/v1/provisioning/alert-rules` after swapping `datasourceUid`
   `stocdup-influx` for the ops instance's InfluxDB data source uid.
8. *(Recommended)* Bucket → Settings → Bucket lock rules → retain objects under
   `postgres/` for 1 day, so a leaked token can't delete recent backups.

**Upgrading from the old PVC backups:** the chart no longer creates the
`wholo-pg-backups` PVC, so `helm upgrade` deletes it and its dumps (local-path
reclaim policy is Delete). Before that upgrade, run one last old-style backup
and copy the newest dump off-cluster:

```bash
kubectl -n wholo create job pg-backup-final --from=cronjob/wholo-pg-backup
kubectl -n wholo wait --for=condition=complete job/pg-backup-final --timeout=600s
kubectl -n wholo run keep-dump --image=postgres:16-alpine --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"keep-dump","image":"postgres:16-alpine","command":["sleep","600"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}],"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"wholo-pg-backups"}}]}}'
kubectl -n wholo exec keep-dump -- ls -1t /backups | head -1        # newest
kubectl -n wholo cp keep-dump:/backups/<newest> ./<newest>
kubectl -n wholo delete pod keep-dump
```

**Day to day:**

```bash
# manual backup now (e.g. before a risky migration)
kubectl -n wholo create job pg-backup-manual-$(date +%s) --from=cronjob/wholo-pg-backup
kubectl -n wholo logs -f -l app=wholo-pg-backup --tail=5   # ends with "backup OK: <object> (<bytes> bytes, <n>s)"

# recent runs
kubectl -n wholo get jobs -l app=wholo-pg-backup
```

The `pg_dump: warning: there are circular foreign-key constraints` lines in
the job log come from TimescaleDB's own catalog tables and are expected — they
only matter for data-only dumps, which this is not.

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
6. `kubectl -n wholo logs deploy/wholo-telegraf` — statsd + influxdb_v2 loaded,
   no write errors; submit an order and confirm it lands on the ops Grafana
   "Stocdup Order Activity" dashboard (ADR-062).
7. `kubectl -n wholo logs deploy/wholo-telegraf` — `inputs.prometheus` (5
   targets, no `connection refused`), `inputs.http_response` +
   `inputs.kube_inventory` loaded, no `forbidden`; `kubectl -n wholo rollout
   status ds/wholo-telegraf-node`; the ops Grafana "Stocdup Platform Health"
   dashboard (ADR-063) shows availability, node CPU/mem/disk and queue depth.
8. `kubectl -n wholo logs ds/wholo-fluent-bit` — `loki` output loaded, no
   `connection refused`; `kubectl -n wholo logs deploy/wholo-api | head` is
   single-line JSON; `{namespace="wholo"}` in the ops Grafana Explore → Loki
   returns lines (ADR-064).
9. Run a manual backup job (see [Backups](#backups)); its log ends with
   `backup OK`, a new `postgres/wholo-<ts>.sql.gz.bin` object is in R2, and the
   ops Grafana "Stocdup Backups" dashboard shows the run as Succeeded.
