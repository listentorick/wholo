# Telemetry setup (metrics)

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

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
