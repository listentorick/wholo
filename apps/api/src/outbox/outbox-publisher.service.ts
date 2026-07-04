import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxEventStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  EVENT_ROUTES,
  NOTIFICATIONS_QUEUE,
  XERO_SYNC_QUEUE,
} from '../queues/queue.constants';

const MAX_PUBLISH_RETRIES = 5;
const BATCH_SIZE = 100;

// Outbox relay (ADR-034/047): moves PENDING outbox rows onto the BullMQ queues
// named in EVENT_ROUTES. Runs only in the single-replica worker process.
// Publishing is idempotent — jobId = outbox event id, so a crash mid-fan-out
// is recovered by re-adding to every route; queues that already have the job
// reject the duplicate. Rows are marked PUBLISHED only after ALL adds succeed.
@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly queues: Map<string, Queue>;
  private publishing = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) notificationsQueue: Queue,
    @InjectQueue(XERO_SYNC_QUEUE) xeroSyncQueue: Queue,
  ) {
    this.queues = new Map([
      [NOTIFICATIONS_QUEUE, notificationsQueue],
      [XERO_SYNC_QUEUE, xeroSyncQueue],
    ]);
  }

  @Interval(5000)
  async tick(): Promise<void> {
    if (this.publishing) return;
    this.publishing = true;
    try {
      await this.publishPending();
    } finally {
      this.publishing = false;
    }
  }

  async publishPending(): Promise<void> {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        OR: [
          { status: OutboxEventStatus.PENDING },
          { status: OutboxEventStatus.FAILED, retryCount: { lt: MAX_PUBLISH_RETRIES } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const event of events) {
      const routes = EVENT_ROUTES[event.eventType] ?? [];
      try {
        for (const queueName of routes) {
          const queue = this.queues.get(queueName);
          if (!queue) {
            throw new Error(`EVENT_ROUTES names queue '${queueName}' but no queue is registered for it`);
          }
          await queue.add(
            event.eventType,
            {
              eventId: event.id,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payload: event.payload,
            },
            { jobId: event.id },
          );
        }
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxEventStatus.PUBLISHED, publishedAt: new Date(), errorMessage: null },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to publish outbox event ${event.id} (${event.eventType}): ${message}`);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxEventStatus.FAILED,
            failedAt: new Date(),
            retryCount: { increment: 1 },
            errorMessage: message,
          },
        });
      }
    }
  }
}
