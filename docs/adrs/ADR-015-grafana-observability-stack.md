# ADR-015: Grafana observability stack (Prometheus, Loki, Tempo, Grafana)

## Status
Accepted

## Context
Operating a multi-service platform on Kubernetes requires visibility into service health, performance and failures. Logs, metrics and distributed traces need to be collected, stored and queryable. A unified observability stack reduces the number of tools to operate and integrate.

## Decision
Observability is provided by the **Grafana stack**, deployed via Helm charts:

| Tool | Role |
|---|---|
| Prometheus | Metrics collection from all services |
| Loki | Log aggregation |
| Tempo | Distributed tracing |
| Grafana | Dashboards, querying and alerting across all three |

Application services are instrumented with **OpenTelemetry**, which provides vendor-neutral traces and metrics. This keeps instrumentation code independent of the Grafana stack, allowing backend components to be swapped later if needed.

Trace IDs propagate into BullMQ job metadata so async chains (e.g. order placement → Xero invoice creation) are traceable end-to-end.

All four Grafana stack components are available as Helm charts and integrate cleanly with a Kubernetes deployment.

## Consequences
- A single pane of glass for logs, metrics and traces reduces context-switching during incidents.
- The Grafana stack adds infrastructure components that must be sized and maintained.
- OpenTelemetry instrumentation is added to all services from the start; retrofitting it later is more expensive.
- Grafana alerting must be configured for critical thresholds (error rate, queue depth, Xero sync lag, Postgres pool utilisation).
