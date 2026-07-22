import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ANALYTICS_FACTS_QUEUE } from '../queues/queue.constants';
import { OrderEventPayload, OrderFactsService } from './order-facts.service';

export interface OutboxEventJobData {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

const ORDER_EVENT_TYPES = new Set(['OrderSubmitted', 'OrderAccepted', 'OrderRejected', 'OrderCancelled']);

// Job name == outbox eventType (set by OutboxPublisherService). Only routed
// event types reach this queue, so an unexpected name is a routing bug — warn
// and complete rather than retrying forever.
@Processor(ANALYTICS_FACTS_QUEUE)
export class AnalyticsFactsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsFactsProcessor.name);

  constructor(private readonly orderFacts: OrderFactsService) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    if (ORDER_EVENT_TYPES.has(job.name)) {
      await this.orderFacts.handleOrderEvent(job.data.eventId, job.name, job.data.payload as OrderEventPayload);
      return;
    }
    this.logger.warn(`No analytics-facts handler for event type '${job.name}' (event ${job.data.eventId}); ignoring`);
  }
}
