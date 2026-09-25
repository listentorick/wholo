# ADR-065: Platform-health metrics via a Prometheus `/metrics` scrape

## Status
Accepted. Amends [ADR-063](ADR-063-core-platform-health-metrics.md): it replaces the transport for ADR-063's HTTP and BullMQ queue metrics. ADR-062 (order activity) and ADR-069 (backups) are unchanged.

## Context
ADR-063 sent the platform-health HTTP and queue metrics as hand-built StatsD datagrams over UDP to Telegraf. That had two documented weaknesses.

- **UDP loses data.** A datagram dropped under load, during Telegraf backpressure, or while Telegraf is restarting is gone for good, so request counts under-report exactly when the platform is stressed.
- **p95 was a percentile of percentiles.** Telegraf computed a p95 per 10-second flush, and Grafana then re-aggregated those windowed values. That is an approximation, not a quantile.

## Decision

### `prom-client` instruments, served on a dedicated `:9464/metrics`
`PlatformMetricsService` (`@wholo/nest-telemetry`) owns a private `prom-client` registry with four instruments:

| Metric | Type | Labels |
|---|---|---|
| `stocdup_http_requests_total` | counter | `method`, `status_class` |
| `stocdup_http_request_duration_seconds` | histogram (10 ms – 10 s buckets) | none |
| `stocdup_queue_jobs` | gauge | `queue`, `state` |
| `stocdup_queue_oldest_waiting_age_ms` | gauge | `queue` |

`environment` and `service` are registry default labels on every series. Each instrument gets a typed method, not a free-form `(name, tags)` call, because prom-client label sets are fixed up front. Default process metrics are not collected.

- **Who records what.** `MetricsInterceptor` records HTTP requests in the four HTTP apps. `QueueMetricsScheduler` sets the queue gauges in the worker.
- **The metrics server.** Every entrypoint calls `startMetricsServerFromEnv(app)`. When `METRICS_PORT` is set (Helm sets `9464`), that starts a bare `node:http` server serving `GET /metrics`. Local `.env` files and tests leave it unset, so no server starts.

**Why a separate port and not a Nest route.** The BFFs face the internet, so an `/api/v1/metrics` route would publish queue depths and request internals. The worker also has no HTTP layer to add a route to.

**Reachability.** Each process gets its own `ClusterIP` Service, `<release>-<app>-metrics`, generated from one list in `_helpers.tpl`. The port is never added to the app's own Service, which is `LoadBalancer` or `NodePort` in some environments, and never to an ingress. So `:9464` is reachable only inside the cluster.

### Telegraf scrapes
`inputs.prometheus` scrapes the five metrics Services every 15 s with `metric_version = 2`. That stores everything in the `prometheus` measurement, one field per metric name, with prometheus labels as tags; histogram buckets are the `<name>_bucket` field with an `le` tag.

- **Nothing is lost between scrapes.** Counters and histograms are cumulative since the process started, so a missed scrape or an InfluxDB outage costs resolution, never events.
- **Restarts are handled in the dashboard.** Flux's `increase()` and `difference(nonNegative: true)` absorb the reset when a pod restarts.
- **p95 is now a true quantile,** computed with `histogramQuantile` over per-window bucket deltas.

Queue gauges hold their last value, so a scrape between the worker's 15 s sweeps returns the last known depth.

### StatsD stays for the other two senders
- **Order activity (ADR-062).** `MetricsService` in `orders.service.ts` stays on StatsD. It's business activity with its own dashboard, and moving it is a separate decision.
- **Backup gauges (ADR-069).** The backup CronJob runs for seconds every six hours and then exits, so there is nothing to scrape. It needs push, and it relies on Telegraf's `delete_gauges = false`, which stays.

Telegraf runs both `inputs.statsd` and `inputs.prometheus`. `STATSD_*` stays only in the api ConfigMap (orders; the worker inherits it). The BFFs no longer send any StatsD.

### Scaling constraint (replaces ADR-063's "Horizontal-scaling behaviour")
Scraping a Service URL is deterministic only while that app runs **one replica**. With more, each scrape reaches a random pod, and the cumulative counters of different pods interleave into nonsense.

This holds today: every app is `replicaCount: 1`, and the worker is pinned to 1 by ADR-047. **Revisit trigger:** before any app scales past one replica, switch to per-pod scraping. Either use `monitor_kubernetes_pods` discovery, accepting a `pod` tag and higher InfluxDB cardinality, or a headless Service with one target per pod.

This is the Prometheus exposition format and client library only. There is no Prometheus server; InfluxDB 2 and Grafana remain the store and the UI. ADR-015's APM stack is still unbuilt and is unaffected.

## Consequences
- HTTP counts are exact, and latency percentiles are real, within the histogram's bucket resolution.
- There's a new dependency (`prom-client`) and one extra listening port per process, plus five small ClusterIP Services. The Dockerfiles are unchanged because the workspace uses a hoisted linker.
- **The dashboard queries changed shape,** from windowed sums to cumulative-counter `increase()`. The live ops Grafana needs `stocdup-platform-health.json` re-imported.
- **Data before the cutover** stays under the old measurements (`stocdup_http_requests`, `stocdup_http_request_ms`, and the old `stocdup_queue_*` StatsD series) until the InfluxDB retention period drops it. The new panels don't read it.
