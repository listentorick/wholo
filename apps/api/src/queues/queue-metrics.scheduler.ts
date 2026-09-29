import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PlatformMetricsService } from '@wholo/nest-telemetry';
import { Queue } from 'bullmq';
import IORedis, { Redis } from 'ioredis';
import {
  ACCOUNTING_BULK_IMPORT_QUEUE,
  ACCOUNTING_CONTACT_SYNC_QUEUE,
  ACCOUNTING_INVOICE_EXPORT_QUEUE,
  ACCOUNTING_PRODUCT_SYNC_QUEUE,
  ACCOUNTING_TAX_TYPE_SYNC_QUEUE,
  ACCOUNTING_INVOICE_SYNC_QUEUE,
  ANALYTICS_FACTS_QUEUE,
  DELIVERY_RUN_ALLOCATION_QUEUE,
  KEYCLOAK_USER_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATIONS_QUEUE,
} from './queue.constants';

// Every queue the worker actually runs a processor for (queue.constants.ts).
// Listed explicitly rather than derived so a new queue is a conscious add here.
const MONITORED_QUEUES = [
  NOTIFICATIONS_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  ACCOUNTING_INVOICE_EXPORT_QUEUE,
  ACCOUNTING_CONTACT_SYNC_QUEUE,
  ACCOUNTING_PRODUCT_SYNC_QUEUE,
  ACCOUNTING_TAX_TYPE_SYNC_QUEUE,
  // Invoice status sync: its oldest-waiting age is "how late is 'order shows
  // as paid'" (ADR-072).
  ACCOUNTING_INVOICE_SYNC_QUEUE,
  ANALYTICS_FACTS_QUEUE,
  ACCOUNTING_BULK_IMPORT_QUEUE,
  DELIVERY_RUN_ALLOCATION_QUEUE,
  // Removed staff members' Keycloak disables (ADR-067): a silent failure here
  // leaves a removed person able to sign in to Keycloak.
  KEYCLOAK_USER_QUEUE,
] as const;

// Job states surfaced to the platform-health dashboard (ADR-063). "failed" and
// "waiting" are the acceptance-criteria metrics; "active"/"delayed" are cheap
// to include and useful context.
const REPORTED_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

const SWEEP_INTERVAL_MS = 15_000;
// ioredis is created with maxRetriesPerRequest: null, so a Redis outage / TCP
// black hole leaves getJobCounts pending indefinitely — without this cap a
// single hung call would keep `running` true forever and silently kill every
// later sweep.
const REPORT_TIMEOUT_MS = 10_000;

class ReportTimeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ReportTimeout(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Platform-health background-job metrics (ADR-063, transport per ADR-065).
 * Worker-process only (the worker is pinned to one replica, so one source).
 * Sets, per queue, every 15s:
 *
 *   stocdup_queue_jobs{queue,state}            gauge   job count per state
 *   stocdup_queue_oldest_waiting_age_ms{queue} gauge   Date.now() - oldest wait ts
 *
 * The gauges are served from the worker's `/metrics` and scraped by Telegraf. A
 * prom-client gauge keeps its last value, so a scrape between sweeps returns
 * the last known depth.
 *
 * Read-only `Queue` handles over a single shared ioredis connection — no
 * processors, no blocking clients. Fire-and-forget: a Redis blip logs a warning
 * and the next sweep recovers; it never touches job processing.
 */
@Injectable()
export class QueueMetricsScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsScheduler.name);
  private readonly connection: Redis;
  private readonly queues: Map<string, Queue>;
  private running = false;

  constructor(
    private readonly metrics: PlatformMetricsService,
    config: ConfigService,
  ) {
    const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    this.connection.on('error', (err) => this.logger.warn(`queue-metrics redis error: ${err.message}`));
    this.queues = new Map(
      MONITORED_QUEUES.map((name) => [name, new Queue(name, { connection: this.connection })]),
    );
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const [name, queue] of this.queues) {
        try {
          await withTimeout(this.report(name, queue), REPORT_TIMEOUT_MS);
        } catch (err) {
          this.logger.warn(`queue-metrics sweep failed for ${name}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async report(name: string, queue: Queue): Promise<void> {
    const counts = await queue.getJobCounts(...REPORTED_STATES);
    for (const state of REPORTED_STATES) {
      this.metrics.setQueueJobs(counts[state] ?? 0, name, state);
    }
    this.metrics.setQueueOldestWaitingAgeMs(await oldestWaitingAgeMs(queue), name);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit().catch(() => undefined);
  }
}

/**
 * Age of the oldest job in the `wait` list. BullMQ's wait list is a Redis LIST
 * whose consume direction has flipped between majors, so sample BOTH ends and
 * take the minimum enqueue timestamp — correct whichever end is the tail.
 * `delayed` / `prioritized` are deliberately excluded (PBI: oldest *waiting*).
 */
async function oldestWaitingAgeMs(queue: Queue): Promise<number> {
  const [head, tail] = await Promise.all([queue.getWaiting(0, 0), queue.getWaiting(-1, -1)]);
  const stamps = [...head, ...tail]
    .map((job) => job?.timestamp)
    .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts));
  return stamps.length ? Math.max(0, Date.now() - Math.min(...stamps)) : 0;
}
