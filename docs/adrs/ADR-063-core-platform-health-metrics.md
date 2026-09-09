# ADR-063: Core platform-health metrics via Telegraf (StatsD + kube_inventory + host DaemonSet) → InfluxDB / Grafana

## Status
Accepted

## Context
The platform operator needs a quick read on whether Stocdup is *up, failing, or
resource-starved*: per-API availability, HTTP request volume, 5xx rate, p95
latency, Kubernetes pod availability + restarts, node CPU/memory/disk %, and
BullMQ failed / oldest-waiting job counts. (PBI-1.)

Nothing serves that today:

- **ADR-062** built a StatsD → Telegraf → InfluxDB 2 → Grafana pipeline, but only
  for two business counters (`stocdup_orders_submitted` / `_order_value_minor`).
  Telegraf runs `inputs.statsd` + `inputs.internal` only; it has no Kubernetes
  API access and no RBAC.
- **ADR-015** planned a full Prometheus / Loki / Tempo / OpenTelemetry APM stack.
  It was never built and is much heavier than this need — a handful of health
  gauges, not distributed tracing and exception aggregation.
- The hand-rolled `/api/v1/health` endpoints (and the Helm probes that hit them)
  are the only existing signal, and nothing records or graphs them.

This ADR adds the *platform-health* slice **on top of the ADR-062 pipeline** — no
new datastore, no Prometheus. It sits beside ADR-015 exactly as ADR-062 does: it
neither implements nor supersedes it.

## Decision

### One Helm flag, layered on the ADR-062 Telegraf
`telegraf.platformHealth.enabled` (default `false`, on in **both**
`values.local.yaml` and `values.live.yaml`) turns on everything below. It needs
no infrastructure beyond the InfluxDB Telegraf already writes to.

### HTTP volume / 5xx / p95 — a per-request interceptor
`MetricsInterceptor` (`@wholo/nest-telemetry`, registered as `APP_INTERCEPTOR`
via `MetricsModule.forRoot()`) runs in every NestJS HTTP app (`api`, `admin-api`,
`portal-api`, `driver-api`). Per request it emits:

| Metric | Type | Tags |
|---|---|---|
| `stocdup_http_requests` | counter | `environment`, `service`, `method`, `status_class` (`2xx`…`5xx`) |
| `stocdup_http_request_ms` | timing | `environment`, `service` |

- **No route/path tag** — a resolved URL carries IDs (PII) and is unbounded
  cardinality. `method` + `status_class` is enough for the PBI's counters.
- The timing carries only `service`, so the p95 series count equals the number of
  services. Telegraf's `inputs.statsd` is switched to `percentiles = [95]`, which
  produces a `95_percentile` field per flush window; Grafana re-aggregates those
  windowed percentiles over the display range. That is a
  percentile-of-percentiles **approximation** — consistent with ADR-062's
  "best-effort trend, not a system of record" stance. Not fixed; documented.
- `/api/v1/health*` is excluded so k8s probes and Telegraf's own `http_response`
  self-checks (below) don't dominate the request count or, during a readiness
  blip, inflate the 5xx rate.
- Interceptors run **after** guards, so a guard-thrown 5xx is not counted.
  Accepted: guard failures are rare and overwhelmingly 401/403.
- The BFFs serve their Next.js frontend for non-`/api/` paths *before* Nest
  boots, so the interceptor only ever sees each BFF's `/api/v1/*` surface — the
  correct scope for "platform" HTTP metrics.

`MetricsService` moved from `apps/api/src/metrics/` into a shared workspace
package `@wholo/nest-telemetry` (with `timing()` / `gauge()` added). It is a
wire-format contract shared by five processes and Telegraf's parser, and drift is
silent (a malformed datagram is dropped, no error) — a single source of truth is
worth the package plumbing (4 Dockerfile + 4 `package.json` edits, the same
mechanism already proven for `@wholo/types`).

### API availability — Telegraf self-checks, no app code
The Telegraf **Deployment** runs one `inputs.http_response` per API against its
`/api/v1/health` Service URL, tagged `service`. This measures "≥1 ready replica
answered", *not* per-pod health — per-pod / partial availability comes from
`kube_inventory` below. The worker has no Service and is not an "API"; its health
is visible only as `kube_inventory` pod status.

### Pod availability + restarts — `inputs.kube_inventory` + the chart's first RBAC
The Telegraf Deployment additionally runs `inputs.kube_inventory` against
`https://kubernetes.default.svc` using its mounted ServiceAccount token (TLS
verified against the mounted `ca.crt`), scoped to the release namespace. This introduces the **first RBAC objects in the
chart**: a `ServiceAccount` + a read-only `ClusterRole`
(`get`/`list`/`watch` on `pods`, `nodes`, `namespaces`, `services` and
`apps/*` workloads) + `ClusterRoleBinding`. `ClusterRole` (not `Role`) because
`kube_inventory` lists the cluster-scoped `nodes` resource. The follow-up
node-log-shipping PBI can bind its agent to a superset of these rules.

### Node CPU/memory/disk % — a `telegraf-node` DaemonSet, hostPath not kubelet
A new DaemonSet runs one Telegraf per node with `inputs.cpu` / `inputs.mem` /
`inputs.disk` reading the host's `/proc` + `/sys`, mounted **read-only** at
`/hostfs` (`HOST_PROC` / `HOST_SYS` / `HOST_MOUNT_PREFIX`). It is **not**
privileged and needs **no** RBAC.

Chosen over querying each node's kubelet `/stats/summary` (`inputs.kubernetes`):
the kubelet path's only unique data is per-pod resource usage (out of scope), and
it would need `nodes/stats` + `nodes/proxy` RBAC, a kubelet TLS exception against
`:10250`, and CPU/mem/disk % computed in Flux from raw counters. hostPath gives
ready-made `usage_active` / `used_percent` fields. A node-level DaemonSet with
read-only hostPath mounts is coming regardless for log shipping (separate PBI →
Loki on the ops host), so this adds no new infrastructure shape.

### BullMQ depth — a worker `@Interval` scheduler emitting gauges
`QueueMetricsScheduler` runs in the worker process only (pinned to one replica by
ADR-047, so exactly one emitter). Every 15s, for each of the 9 queues in
`queue.constants.ts`, it emits:

| Metric | Tags | Source |
|---|---|---|
| `stocdup_queue_jobs` | `queue`, `state` (`waiting`/`active`/`delayed`/`failed`) | `Queue.getJobCounts` |
| `stocdup_queue_oldest_waiting_age_ms` | `queue` | `Date.now() - min(timestamp)` sampled from both ends of the `wait` list |

Read-only `Queue` handles over one shared ioredis connection — no processors, no
blocking clients. Telegraf's `inputs.statsd` is switched to
`delete_gauges = false` so these series stay continuous between sweeps (a
decommissioned queue's series then lingers until Telegraf restarts — acceptable,
queues are static).

### Horizontal-scaling behaviour
The `stocdup_http_*` metrics carry no `pod` tag, so N app replicas all feed one
set of `service`-keyed series: Telegraf sums identical-tag counters per flush and
pools timing samples per `service`, and cardinality does not grow with replicas.
This depends on the Telegraf **Deployment staying at `replicas: 1`** — a scaled
Telegraf would receive a random slice of the UDP datagrams and fragment both the
counter sums and the p95. `kube_inventory` per-pod series grow with replicas ×
rollout churn (standard k8s-monitoring cardinality, bounded by retention).

### Dashboard — one committed file, two consumers
`helm/wholo/dashboards/stocdup-platform-health.json` (uid
`stocdup-platform-health`, `${DS_INFLUXDB}` datasource **variable**,
`environment` + `service` template variables, 1h / 24h / 7d ranges). Provisioned
locally via the existing Grafana ConfigMaps — `configmap-dashboards.yaml` now
globs `dashboards/*.json` so future dashboards are zero-config. In live the ops
team imports the same file into the external Grafana by hand
(`docs/deployment/live-k3s.md`), exactly as for the order-activity dashboard.

## Consequences
- One new Helm flag (`telegraf.platformHealth.enabled`), off by default.
- The chart's first RBAC objects (read-only ClusterRole/Binding) and its first
  DaemonSet + its first pod that mounts a ServiceAccount token / hostPath.
- One new npm workspace package, `@wholo/nest-telemetry`; `apps/api/src/metrics/`
  is deleted (moved into it). No new third-party dependency — `dgram` is built in.
- New env vars: `SERVICE_NAME` on every app + the worker; `APP_ENV` /
  `STATSD_HOST` / `STATSD_PORT` extended to the three BFF ConfigMaps.
- p95 is a windowed approximation; HTTP/queue counts under-report on UDP loss or
  Telegraf downtime (inherited from ADR-062). Reconciliation is out of scope.
- Telegraf `kube_inventory` measurement/field names and BullMQ's "oldest waiting"
  list semantics are version-sensitive — the dashboard has a `pod_name` regex
  fallback and the scheduler samples both ends of the wait list.
- ADR-015 stays unbuilt; this ADR is complementary, not a replacement.
- Node **log** collection (→ external Loki, via a dedicated agent) is a
  deliberate follow-up PBI, not part of this one.

## References
- ADR-015 — planned Grafana/Prometheus/Loki/Tempo observability stack (unbuilt; complementary)
- ADR-047 — per-concern BullMQ queues + the single-replica worker
- ADR-048 — live k3s environment (values.live.yaml pattern, ClusterIP-in-live)
- ADR-060 — marketing site + the optional-infra feature-gate pattern this follows
- ADR-062 — platform-operator business-activity telemetry (the pipeline this extends)
