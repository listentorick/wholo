import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Platform-health metrics (ADR-065, amending ADR-063's transport) as
 * `prom-client` instruments, exposed on the cluster-internal `/metrics`
 * endpoint (`startMetricsServer`) and scraped by Telegraf `inputs.prometheus`.
 *
 * Counters and histograms are cumulative since process start, so a scrape can
 * never lose an event the way a UDP datagram can, and Flux `increase()` handles
 * a pod restart. Latency is a real histogram, so p95 is a true quantile.
 *
 * `environment` and `service` are registry default labels — call sites pass
 * only the per-instrument labels. Labels are fixed sets (`prom-client` needs
 * them declared up front), so there is one typed method per instrument rather
 * than a free-form `(name, tags)` API that could drift silently.
 *
 * `collectDefaultMetrics()` is deliberately not called — process/GC metrics
 * are not part of the platform-health slice and would multiply series.
 *
 * Order-activity counters (ADR-062) stay on StatsD via `MetricsService`.
 */
@Injectable()
export class PlatformMetricsService {
  readonly registry = new Registry();

  private readonly httpRequests = new Counter({
    name: 'stocdup_http_requests_total',
    help: 'HTTP requests handled, by method and status class (health checks excluded).',
    labelNames: ['method', 'status_class'] as const,
    registers: [this.registry],
  });

  private readonly httpDuration = new Histogram({
    name: 'stocdup_http_request_duration_seconds',
    help: 'HTTP request duration in seconds (health checks excluded).',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  private readonly queueJobs = new Gauge({
    name: 'stocdup_queue_jobs',
    help: 'BullMQ jobs per queue and state, as of the last sweep.',
    labelNames: ['queue', 'state'] as const,
    registers: [this.registry],
  });

  private readonly queueOldestWaitingAgeMs = new Gauge({
    name: 'stocdup_queue_oldest_waiting_age_ms',
    help: 'Age in ms of the oldest waiting job per queue, as of the last sweep.',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });

  constructor(config: ConfigService) {
    this.registry.setDefaultLabels({
      environment: config.get<string>('APP_ENV', 'local'),
      service: config.get<string>('SERVICE_NAME', 'unknown'),
    });
  }

  recordHttpRequest(method: string, statusClass: string): void {
    this.httpRequests.inc({ method, status_class: statusClass });
  }

  /** Non-finite or negative durations are dropped — `observe(NaN)` throws. */
  observeHttpDuration(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.httpDuration.observe(seconds);
  }

  /** Non-finite values record 0 and negatives clamp to 0 — `set(NaN)` throws. */
  setQueueJobs(value: number, queue: string, state: string): void {
    this.queueJobs.set({ queue, state }, nonNegative(value));
  }

  setQueueOldestWaitingAgeMs(value: number, queue: string): void {
    this.queueOldestWaitingAgeMs.set({ queue }, nonNegative(value));
  }
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
