# Log aggregation setup

> Part of the [live-ops runbook](../README.md). One-time setup — do this once per environment; day-to-day operation is in the runbook's other pages.

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
   resolve and reach `loki.home.arpa:3100` (same `netcheck` pod as in [telemetry.md](telemetry.md), with
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

## Accounting alerts

`helm/wholo/alerting/stocdup-accounting.yaml` holds four Grafana alert rules that
read Loki. Locally they are provisioned automatically; on the ops Grafana create
them once by hand (Alerting → Alert rules → New, or import the file's rules),
replacing `datasourceUid: stocdup-loki` with the ops Loki data source uid.

| Rule | Fires when | What to do |
|---|---|---|
| Accounting job gave up | an accounting queue job failed its **final** attempt (`queue.job.failed`, `final="true"`) | Explore → Loki `{app=~".*worker"} \| json \| event="queue.job.failed" \| final="true"`; the line carries `queue`, `jobId`, `eventId`, `aggregateId`, `err`. Invoice exports can be retried from the order page. |
| Xero rejected Stocdup application credentials | `accounting.connection.invalid_client` | `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` are wrong or revoked — affects every distributor. |
| Accounting errors spike | more than 5 `level="error"` accounting lines in 15 min | error level means a bug or a give-up; routine provider rejections are `warn`. Group by `event`. |
| Xero daily call limit low | `accounting.provider.day_limit_low` for an organisation | that organisation has used 90% of Xero's 5,000 calls/day; find it by `externalOrgId` in `accounting_connections`. |

Every accounting log line carries a stable `event` plus `distributorId`,
`connectionId`, `provider` (and `runId` / `exportId` / `orderId` where relevant),
so `| json | distributorId="…"` narrows to one distributor.

