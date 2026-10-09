# System overview (live)

> Part of the [live-ops runbook](README.md). Rationale: [ADR-048](../adrs/ADR-048-live-environment-k3s.md). Routing detail: [url-map.md](url-map.md).

## Topology

- **Cluster:** 3 k3s nodes: `k3s-00` (control-plane, schedulable), `k3s-01` and `k3s-02`. Each has about 2 CPU, 4 GiB RAM and 22 GiB disk.
- **Storage:** `local-path` only. It is node-local with ReclaimPolicy **Delete**.
  - A PVC lives on one node's disk. A pod using it can only run on that node.
  - `helm uninstall` or deleting a PVC destroys its data for good.
- **Edge:** Cloudflare (proxied DNS, edge TLS, WAF rules, SSL mode **Full (strict)**) → on-prem WAF appliance (terminates the Cloudflare leg with a Cloudflare Origin CA cert) → bundled Traefik over **plain HTTP :80**.
  - `ingress.tls: false`. Traefik trusts the WAF's `X-Forwarded-Proto` via `deploy/live/traefik-config.yaml`.
  - There is no cert-manager or Let's Encrypt.
- **Traefik:** runs as a DaemonSet, one pod per node labelled `svccontroller.k3s.cattle.io/enablelb=true` (all 3 nodes currently).
  - It uses `externalTrafficPolicy: Local`, so the real client IP reaches Traefik whichever node a request lands on.
- **Images:** published to GHCR as `ghcr.io/listentorick/wholo/{api,portal-api,admin-api,driver-api,keycloak,www}` by the `build-images` workflow on every push to `master`.
  - Tags are `sha-<7-char sha>` plus `latest`. Always deploy a pinned `sha-` tag.
  - The packages are currently public, so no pull secret is needed. If they are made private, see [secrets.md](secrets.md#ghcr-pull-secret).
- **Live config:** `helm/wholo/values.live.yaml`. It is gitignored and holds every live secret; copy it from `values.live.example.yaml`.
- **Ops host** (outside the cluster, reachable only from the LAN/VPN): InfluxDB 2, Grafana and Loki at `influxdb.home.arpa`, `grafana.home.arpa` and `loki.home.arpa`.
  - The cluster only runs the shippers: Telegraf and Fluent Bit.

## Public hosts

| Host | Serves | Notes |
|---|---|---|
| `www.<domain>` | `wholo-www` (marketing site) | The apex `<domain>` 301s here via a Cloudflare Redirect Rule |
| `portal.<domain>` | `wholo-portal-api` (customer portal + BFF) | |
| `admin.<domain>` | `wholo-admin-api` (admin app + BFF) | Also the Xero OAuth callback |
| `driver.<domain>` | `wholo-driver-api` (driver PWA + BFF) | QR delivery links are minted on this host |
| `auth.<domain>` | `wholo-keycloak` | Identity: token issuer, login pages |
| `health.<domain>` | health endpoints | **Internal DNS only**, IP-allowlisted (`healthAccess.allowedIPs`) |

`apps/api` has **no** public host. The BFFs reach it over cluster DNS.

## Components

All resources are in namespace `wholo` and named `wholo-*`.

| Component | Kind / replicas | State | Depends on | If it's down |
|---|---|---|---|---|
| `wholo-api` | Deployment ×1, RollingUpdate (surge 1, unavailable 0); initContainer `migrate` runs Prisma migrations | none (stateless) | postgresql, redis | Every app's API calls fail; the BFFs return 5xx |
| `wholo-worker` | Deployment ×1, **Recreate**; health on :3099 (`/health/live`, `/health/ready`) | none | postgresql, redis, SMTP, Keycloak admin, Xero | Order events, emails, Xero sync, analytics facts and Keycloak disables queue up. **Must stay at exactly 1 replica** (ADR-047: the outbox relay is the only publisher) |
| `wholo-portal-api` | Deployment ×1, RollingUpdate | none | api, keycloak (JWKS) | Customer portal down |
| `wholo-admin-api` | Deployment ×1, RollingUpdate | none | api, keycloak (JWKS) | Admin app down, Xero connect callback fails |
| `wholo-driver-api` | Deployment ×1, RollingUpdate | none | api | Driver PWA and delivery QR links down |
| `wholo-www` | Deployment ×1, RollingUpdate | none | SMTP, plausible | Marketing site down |
| `wholo-keycloak` | Deployment ×1; initContainer `db-init` | the `keycloak` database | postgresql | **Nobody can log in**. Existing sessions fail when their tokens need refreshing |
| `wholo-postgresql` | Deployment ×1, **Recreate**; `timescale/timescaledb:2.17.2-pg16` | PVC `wholo-postgresql` (5Gi): databases `wholo`, `keycloak`, `plausible` | — | Everything is down |
| `wholo-redis` | Deployment ×1, **Recreate**; `redis:7-alpine`, AOF on | PVC `wholo-redis` (1Gi): BullMQ queues | — | api `/ready` fails and background jobs stop. The outbox in Postgres keeps pending events |
| `wholo-clickhouse` | Deployment ×1, **Recreate** | PVC `wholo-clickhouse` (3Gi): Plausible events | — | Analytics only |
| `wholo-plausible` | Deployment ×1; initContainer `migrate` | the `plausible` database + ClickHouse | postgresql, clickhouse | Analytics only. www keeps working |
| `wholo-telegraf` | Deployment ×1 | none | ops-host InfluxDB | Metrics gap only; apps are unaffected (fire-and-forget) |
| `wholo-telegraf-node` | DaemonSet | none | ops-host InfluxDB | Node metrics gap only |
| `wholo-fluent-bit` | DaemonSet | position DB in hostPath `/var/lib/wholo-fluent-bit` | ops-host Loki | Log gap only |
| `wholo-mailhog` | Deployment ×1 | none | — | Nothing (unused in live) |
| `wholo-pg-backup` | CronJob `0 */6 * * *` | writes to R2 `stocdup-db-backups/postgres/` | postgresql, R2 | No new backups. The backup alerts fire |

## Where state lives

| Data | Where | Backed up? |
|---|---|---|
| Business data (orders, customers, products, outbox, audit, facts) | Postgres `wholo` | Yes, every 6h to R2 (`pg_dumpall`) |
| Users, credentials, sessions, realm config | Postgres `keycloak` | Yes (same dump) |
| Plausible app data | Postgres `plausible` | Yes (same dump) |
| Plausible pageview events | ClickHouse PVC | **No** |
| Job queues (BullMQ) | Redis PVC (AOF) | **No**. It is rebuildable: pending work is also in `outbox_events` |
| Product images, delivery evidence | Cloudflare R2 (`api.r2.bucketName`, `deliveryBucketName`) | R2's own durability only |
| Accounting of record (invoices, payments) | Xero | Xero |
| Metrics, logs | Ops-host InfluxDB / Loki | Ops host's concern |

## Web analytics (Plausible)

The cluster runs its own copy of [Plausible Community Edition](https://plausible.io/), a cookieless web-analytics tool. It records visits to the marketing site (`www.<domain>`) only. It holds no business data and is separate from the ops-host Grafana dashboards. The decision is in [ADR-060](../adrs/ADR-060-marketing-site.md).

- **It is optional.** It runs only when `plausible.enabled` is true in `values.live.yaml`, and it records visits only if the `www` image was built with `WWW_PLAUSIBLE_ENABLED=1` ([setup/github.md](setup/github.md)).
- **Two components:** `wholo-plausible` (the app and dashboard) and `wholo-clickhouse` (its event store).
- **Two stores:**
  - The `plausible` Postgres database holds Plausible's own logins, the registered site and its settings. It is backed up.
  - ClickHouse holds the pageview history. It is **not** backed up; see [Where state lives](#where-state-lives).
- **No public host.** `www` proxies `/js/script.js` and `/api/event` to it over cluster DNS ([url-map.md](url-map.md)). To see the dashboard, port-forward and browse `http://localhost:8000`:

  ```bash
  kubectl -n wholo port-forward svc/wholo-plausible 8000:8000
  ```

- **If it fails,** only analytics is affected; `www` keeps working. It is safe to scale down under memory pressure ([incidents/node-problems.md](incidents/node-problems.md)).

Related pages:

- Using the dashboard: [analytics.md](analytics.md)
- First-time setup: [setup/marketing-site.md](setup/marketing-site.md)
- Its two keys: [secrets.md](secrets.md)
- Upgrades: [maintenance.md](maintenance.md)
- What a restore brings back: [disaster-recovery.md](disaster-recovery.md)

## Health endpoints

- **`GET /api/v1/health`:** liveness. It returns `{status:"ok"}` if the process is up.
- **`GET /api/v1/health/ready`:** readiness. It checks Postgres (`SELECT 1`) and Redis (`PING`). On failure it returns 503 with `checks: {db, redis}`.
- **Where to call them:**
  - From outside, via the allowlisted `health.<domain>/central|admin|portal/…`.
  - From inside the cluster: `kubectl -n wholo exec deploy/wholo-api -- wget -qO- localhost:3001/api/v1/health/ready`.
