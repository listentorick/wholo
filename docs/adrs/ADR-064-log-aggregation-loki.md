# ADR-064: Log aggregation via Fluent Bit → Loki, structured JSON app logs

## Status
Accepted

## Context
Every Stocdup component logs to stdout, but nothing collects it — an operator's
only view into a live incident is `kubectl logs` against one pod at a time.
`architecture.md` §7 states the target: *"Structured JSON logs from all services
are shipped to Loki."*

- **ADR-015** planned a full Prometheus / Loki / Tempo / OpenTelemetry stack. It
  was never built and is much heavier than this need.
- **ADR-063** (platform-health metrics) deferred log shipping to "a separate PBI
  → Loki on the ops host, via a dedicated agent" and deliberately shaped its
  DaemonSet + RBAC + `*.enabled` + dashboard-glob patterns for reuse here.
- Today the 5 Node processes (`apps/api` main + its worker, `apps/admin-api`,
  `apps/portal-api`, `apps/driver-api`) use NestJS's default `Logger` —
  ANSI-coloured plain text, heavy boot noise, **no request-log line**, and 5xx
  errors **silently swallowed** by the `@Catch()`-all `ProblemDetailsFilter`
  (which pre-empts Nest's own exception logging). `www` is near-silent Next.js;
  `keycloak` is plain Quarkus text.

This ADR builds the log-aggregation slice on top of the ADR-062/063 pattern
(in-cluster agent → external ops host in live; local infra in-cluster behind
`*.enabled`). Complementary to ADR-015 (no Tempo / OTel / Prometheus) and to
ADR-063 (metrics *count*, logs *explain*).

## Decision

### Collector: Fluent Bit (one node DaemonSet)
`fluent/fluent-bit` runs as `wholo-fluent-bit` (DaemonSet, mirrors
`telegraf-node`): tails `/var/log/containers/*_wholo_*.log` (the CRI symlinks,
namespace-scoped by filename), enriches each record with k8s metadata, parses
the JSON body from the Node processes, and pushes everything to Loki. ~30 MB per
node, CNCF, vendor-neutral. Chosen over **Grafana Alloy** (heavier; its
consolidate-metrics-and-traces upside is moot while ADR-015 is unbuilt and
Telegraf owns metrics) and **Promtail** (deprecated by Grafana, Feb 2025).

### Structured JSON via `nestjs-pino`, folded into `@wholo/nest-telemetry`
The 5 Node processes switch to `nestjs-pino` — one JSON object per event to
stdout: `level` (string), `time` (ISO-8601), `msg`, `context` (the
`new Logger('Ctx')` name), `reqId`, plus the ambient `service` / `environment`
(the same identifiers as the ADR-062/063 metric tags). Every existing
`new Logger(ctx)` call site routes through pino unchanged once
`app.useLogger(app.get(PinoAppLogger))` is set in each entrypoint (`bufferLogs`
+ `flushLogs`). Request logging (method, path, status, duration, `reqId`) comes
from pino-http, with `/api/v1/health*` excluded.

Folded into the existing `@wholo/nest-telemetry` package rather than a new one:
the Docker plumbing (`COPY packages/nest-telemetry/{package.json,dist}` into
each runner's `node_modules`, the build step, the `workspace:*` dep) already
exists in all 4 API Dockerfiles from ADR-063, and the worker runs the api image
— folding in means **zero Dockerfile changes, zero new per-app deps**.

`www` (plain Next.js) and `keycloak` / `postgres` / `redis` / `mailhog` /
`plausible` / `clickhouse` ship **raw**: Fluent Bit forwards their stdout with a
synthetic `level=info` and the same k8s labels. No ANSI-strip / per-runtime
multiline reassembly is attempted — Keycloak console colour is off by default,
Next prod output is colourless, and pino has none; Java/Postgres multi-line
stack traces land as separate Loki entries (accepted — pino app errors are
single-line JSON, so the case that matters is covered).

### Loki: in-cluster single-binary for local dev only
`grafana/loki` (single binary, filesystem storage, TSDB + schema `v13`, 72h
retention) runs in-cluster behind `loki.enabled` — mirrors
`influxdb.enabled` / `grafana.enabled`. In **live** `loki.enabled: false` and
Fluent Bit pushes to the ops host `http://192.168.1.15:3100/loki/api/v1/push`
(`fluentBit.loki.host`). The k3s nodes — including the schedulable control-plane
node — need egress to that host on `:3100`; **egress ≠ ingress** (the
`healthAccess` allowlist is inbound), so the ops firewall must permit it, same
as the `:8086` InfluxDB path.

### Loki label discipline
Index labels, all bounded: `namespace`, `app` (`wholo-<x>` — the k8s label on
every chart pod), `container`, `node`, `environment`, `job` (constant
`fluent-bit`). Structured metadata (queryable, not indexed): `pod`, `level`,
`stream`. Everything else lives inside the JSON line and is reached with
`| json` at query time. **Never** anywhere: request/trace ids as labels,
order/customer/user ids, email addresses, tokens, full URLs with query strings.
Enforced by the Fluent Bit `Labels`/`Structured_Metadata` allowlists, pino
`redact`, and the `req` serializer stripping query strings.

### Separate least-privilege RBAC
`wholo-fluent-bit` gets its own SA + ClusterRole (`get`/`list`/`watch` on
`pods`, `namespaces` only). Not bound to `wholo-telegraf`'s role — that only
exists when `telegraf.platformHealth.enabled`, but log shipping must work with
platform-health metrics off. ADR-063's "can bind to a superset" note was
permission, not a mandate.

### `ProblemDetailsFilter` logs 5xx
A shared `logHttpException()` helper (in `@wholo/nest-telemetry`) is called from
all 4 filter copies: `status >= 500` → **`error`** (one line: a `method path ->
status` message plus the exception serialized under `err`, so the stack is
structured, not the message); `400-499` → `debug`; `/api/v1/health*` → nothing
(readiness "not ready" is control flow, not an error). This is the first time
5xx stack traces reach stdout at all.

The filter is the **single `error`-level emitter** per failed request: pino-http's
request-completion line for a 5xx stays at `warn` (`customLogLevel`), so
`level="error"` counts a 5xx exactly once and 5xx alerting derived from log
counts isn't inflated.

### PII / secret hygiene
Fixed now: `mail.service.ts` masks recipient emails in its 4 log lines
(`maskEmail` → `r***@example.com`); `order-as` interceptor/controller `sub` /
`customerId` / `distributorId` lines dropped to `debug` (gone at the default
`info`). Kept: `accounting-connection.service.ts` OAuth-failure stack (a genuine
5xx signal; Xero's `code`/`state` are POST-body, not URL). A full audit of every
`logger.*` call in `apps/api` for embedded identifiers is a noted follow-up.

### Grafana
A `Loki` datasource (`uid: stocdup-loki`) is provisioned into the local Grafana
when `loki.enabled`. `helm/wholo/dashboards/stocdup-logs.json` (a `DS_LOKI`
datasource variable, `app` / `level` / `search` template vars, a logs panel +
volume-by-app / volume-by-level / error / 5xx / total stats) auto-provisions via
the existing `dashboards/*.json` glob and is hand-imported into the ops Grafana
in live. **Grafana → Explore → Loki is the primary log-viewing tool**; the
dashboard is the at-a-glance view.

## Consequences
- Two new optional components (`loki`, `fluent-bit`); the chart's second RBAC
  set and second/third DaemonSet.
- `nestjs-pino` + `pino` + `pino-http` added to `@wholo/nest-telemetry`
  (`pino-pretty` dev-only, opt-in via `LOG_PRETTY=1` — never auto-enabled, so it
  can't leak a worker-thread transport into jest/integration runs). No per-app
  dependency or Dockerfile change.
- The 5 Node processes now emit JSON — boot noise (`InstanceLoader`,
  `RoutesResolver`, "Mapped {route}") becomes dozens of `info` JSON lines per
  boot; `logging.level: "warn"` in `values.live.yaml` is the knob (default stays
  `info`).
- 5xx errors + stacks reach stdout for the first time.
- New `LOG_LEVEL` env var on the 4 API configmaps (worker inherits).
- `values.local.yaml` gains `loki.enabled` + `fluentBit.enabled`;
  `values.live.yaml` gains a `fluentBit` block, `loki.enabled` stays false.
- Loki HA / scaling and live retention/storage are the ops host's concern —
  **out of scope**.
- The Fluent Bit position DB is a `hostPath` (survives pod restarts, so an
  upgrade doesn't re-tail every file and double-ship into Loki). If a
  PodSecurity `restricted` policy is ever enforced on `wholo` it must permit the
  read-only `/var/log` mounts + this `hostPath`, same as `telegraf-node`.
- ADR-015 stays unbuilt; this ADR realises its `Loki` row (with Fluent Bit, not
  Promtail; no Tempo/OTel).

## References
- ADR-015 — planned Grafana/Prometheus/Loki/Tempo stack (unbuilt; this realises the Loki row)
- ADR-048 — live k3s environment (values.live.yaml pattern, ops host 192.168.1.15)
- ADR-060 — optional-infra feature-gate pattern
- ADR-062 — order-activity telemetry (the in-cluster-agent → external-ops-host precedent)
- ADR-063 — core platform-health metrics (the DaemonSet + RBAC pattern reused here)
