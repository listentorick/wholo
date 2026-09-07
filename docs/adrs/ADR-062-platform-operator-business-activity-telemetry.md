# ADR-062: Platform-operator business-activity telemetry via StatsD / Telegraf / InfluxDB / Grafana

## Status
Accepted

## Context
The platform operator (not a distributor) needs an always-on read on commercial
activity across the whole tenant base: how many orders are being submitted, for
what value, by which distributor, and split between orders customers place
themselves in the portal versus orders a distributor places on a customer's
behalf.

Nothing serves that today:

- The **TimescaleDB fact pipeline** (`OrderFact` / `OrderLineFact` /
  `OrderAnalyticsState`, fed by the transactional outbox → BullMQ
  `analytics-facts` queue → `OrderFactsService`, ADR-034 / ADR-047) is
  **distributor-facing** — it powers the per-distributor analytics screens in the
  admin app. It is also **replay-driven**: the hypertables are rebuilt from
  outbox history (`scripts/rebuild-analytics-state.ts`), so it is the wrong place
  to count "a submission happened" — a rebuild would re-count everything.
- **ADR-015** planned a Grafana/Prometheus/Loki/Tempo + OpenTelemetry stack for
  service observability. It was never implemented, and it is heavier than this
  need — this is a handful of business counters, not APM.

An InfluxDB 2 instance and a Grafana already run on the operator's monitoring
host. The constraint from the operator side is firm: **Stocdup must not connect
directly to InfluxDB or hold InfluxDB credentials.**

## Decision

### One instrumented event: a successfully submitted order
`OrdersService.submitOrder` emits two StatsD counters immediately **after** the
submit `prisma.$transaction` commits and before it returns — the same method that
writes the `OrderSubmitted` outbox event, but outside the transaction so a
rolled-back or rejected order emits nothing. Auto-accepted orders count too (they
are still successful submissions). No other call site emits metrics.

| Metric | Value |
|---|---|
| `stocdup_orders_submitted` | `1` |
| `stocdup_order_value_minor` | order total in ISO-4217 **minor units** (£127.50 → `12750`), via `toMinorUnits()` in `apps/api/src/common/currency.ts` (exponent read from `Intl.NumberFormat`, not a hand-kept table) |

Tags on both: `environment` (from the new `APP_ENV` env var), `distributor_id`,
`distributor_name`, `source` (`portal` | `on_behalf`, from
`orderAsSessionToken`), `currency`. **No order, customer or user identifiers** —
unbounded tag cardinality and a privacy leak. `distributor_name` is a
point-in-time snapshot: a renamed distributor produces a second series until the
old data ages out of retention.

### UDP StatsD out, nothing else
`MetricsService` (`apps/api/src/metrics/`, `@Global`) owns a single `dgram` UDP
socket and hand-builds the InfluxDB-style StatsD line
(`name,tag=value,...:N|c`) that Telegraf's `inputs.statsd` parses natively. No
StatsD or InfluxDB client library is added. Every tag value is sanitised to a
wire-safe charset (line-protocol break characters and whitespace → `_`, length
capped) so a distributor name can't corrupt the datagram.

The contract is **fire-and-forget**: `increment()` returns `void`, is never
awaited, has an internal try/catch and a call-site try/catch, and is a silent
no-op when `STATSD_HOST` is unset (the local default and the test default — same
idiom as `MailService` with no SMTP host). A Telegraf or InfluxDB outage, or UDP
loss, can neither fail nor slow an order submission. Delivery is explicitly not
guaranteed (matches the PBI's out-of-scope list); the outbox / fact pipeline
remains the exact record.

### Telegraf in-cluster in every environment; InfluxDB + Grafana in-cluster locally only
- **Telegraf** (`helm/wholo/templates/telegraf/`, `telegraf.enabled`) is the
  StatsD sink in both environments. Its `outputs.influxdb_v2` target is the only
  thing that differs: the in-cluster InfluxDB service locally, the operator's
  external host in live (`telegraf.influx.url`). The write token lives only in
  the Telegraf Secret, sourced from `telegraf.influx.token` (or, locally,
  `influxdb.adminToken`). Health/liveness is Telegraf's `outputs.health` plugin
  on `:8080`. This is the first `protocol: UDP` Service in the chart.
- **InfluxDB 2** (`influxdb.enabled`) and **Grafana** (`grafana.enabled`) run
  in-cluster **only for local dev**, so the whole path is exercisable on Docker
  Desktop. In live both are `false` — they are external. Follows the
  `plausible` / `clickhouse` optional-infra precedent.

### Dashboard: one committed file, two consumers
`helm/wholo/dashboards/stocdup-order-activity.json` is the single source of
truth. Locally it is auto-provisioned into the in-cluster Grafana (datasource +
file provider via ConfigMaps). In live the operator imports the same file into
the external Grafana by hand (documented in `docs/deployment/live-k3s.md`) —
there is no automation for the external instance. It uses a datasource
**variable**, not a hard-coded uid, so it provisions locally and imports cleanly
against a differently-named external datasource.

## Consequences
- Three new optional Helm flags (`telegraf` / `influxdb` / `grafana`), all off by
  default; enabled in `values.local.yaml`, only `telegraf` in `values.live.yaml`.
- One new env var, `APP_ENV` (default `local`), on `apps/api` + worker.
- No new npm dependency — `dgram` is built in.
- Counts under-report on UDP loss or Telegraf downtime. Acceptable for a trend
  view; reconciliation against Postgres is out of scope.
- ADR-015 stays as-is: it is a different concern (service/APM observability) and
  is still unbuilt. This ADR neither implements nor supersedes it.
- `k3s` nodes need egress to the ops host on `:8086`.

## References
- ADR-015 — planned Grafana observability stack (unbuilt; complementary, not superseded)
- ADR-034 — transactional outbox for order events (the `OrderSubmitted` event this sits beside)
- ADR-047 — per-concern BullMQ queues → the distributor-facing TimescaleDB fact pipeline
- ADR-048 — live k3s environment (values.live.yaml pattern, ClusterIP-in-live)
- ADR-060 — marketing site + the optional-infra feature-gate pattern this follows
