import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from '../queues/queue.constants';
import { OrderPlacedNotificationService, OrderSubmittedEventPayload } from './order-placed-notification.service';

export interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

// Job name == outbox eventType (set by OutboxPublisherService). Only routed
// event types reach this queue, so an unexpected name is a routing bug — warn
// and complete rather than retrying forever.
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly orderPlaced: OrderPlacedNotificationService) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    if (job.name === 'OrderSubmitted') {
      await this.orderPlaced.handleOrderSubmitted(job.data.payload as OrderSubmittedEventPayload);
      return;
    }
    this.logger.warn(`No notification handler for event type '${job.name}' (event ${job.data.eventId}); ignoring`);
  }
}
