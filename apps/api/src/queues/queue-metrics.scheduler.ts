import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { MetricsService } from '@wholo/nest-telemetry';
import { Queue } from 'bullmq';
import IORedis, { Redis } from 'ioredis';
import {
  ACCOUNTING_BULK_IMPORT_QUEUE,
  ACCOUNTING_CONTACT_SYNC_QUEUE,
  ACCOUNTING_INVOICE_EXPORT_QUEUE,
  ACCOUNTING_PRODUCT_SYNC_QUEUE,
  ACCOUNTING_TAX_TYPE_SYNC_QUEUE,
  ANALYTICS_FACTS_QUEUE,
  DELIVERY_RUN_ALLOCATION_QUEUE,
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
  ANALYTICS_FACTS_QUEUE,
  ACCOUNTING_BULK_IMPORT_QUEUE,
  DELIVERY_RUN_ALLOCATION_QUEUE,
] as const;

// Job states surfaced to the platform-health dashboard (ADR-063). "failed" and
// "waiting" are the acceptance-criteria metrics; "active"/"delayed" are cheap
// to include and useful context.
const REPORTED_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

const SWEEP_INTERVAL_MS = 15_000;

/**
 * Platform-health background-job metrics (ADR-063). Worker-process only (the
 * worker is pinned to one replica, so one emitter). Emits, per queue, every
 * 15s:
 *
 *   stocdup_queue_jobs{queue,state}            |g   job count per state
 *   stocdup_queue_oldest_waiting_age_ms{queue} |g   Date.now() - oldest wait ts
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
    private readonly metrics: MetricsService,
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
          await this.report(name, queue);
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
      this.metrics.gauge('stocdup_queue_jobs', counts[state] ?? 0, { queue: name, state });
    }
    this.metrics.gauge('stocdup_queue_oldest_waiting_age_ms', await oldestWaitingAgeMs(queue), {
      queue: name,
    });
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
