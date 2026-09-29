import { Processor } from '@nestjs/bullmq';
import { LoggedWorkerHost } from '../queues/logged-worker-host';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ANALYTICS_FACTS_QUEUE } from '../queues/queue.constants';
import { OrderEventPayload, OrderFactsService } from './order-facts.service';
import { RELATIONSHIP_EVENT_TYPES, RelationshipEventPayload, RelationshipFactsService } from './relationship-facts.service';
import { DELIVERY_EVENT_TYPES, DeliveryEventPayload, DeliveryFactsService, toOrderEventPayload } from './delivery-facts.service';

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
export class AnalyticsFactsProcessor extends LoggedWorkerHost {
  private readonly logger = new Logger(AnalyticsFactsProcessor.name);

  constructor(
    private readonly orderFacts: OrderFactsService,
    private readonly deliveryFacts: DeliveryFactsService,
    private readonly relationshipFacts: RelationshipFactsService,
  ) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    if (ORDER_EVENT_TYPES.has(job.name)) {
      await this.orderFacts.handleOrderEvent(job.data.eventId, job.name, job.data.payload as OrderEventPayload);
      return;
    }
    if (DELIVERY_EVENT_TYPES.has(job.name)) {
      // One delivery event feeds both: the order lifecycle (status -> DELIVERED /
      // DELIVERY_FAILED) and the delivery-specific fact. Each is idempotent on its
      // own, so a retry after a partial failure completes whichever half is missing.
      const payload = job.data.payload as DeliveryEventPayload;
      await this.orderFacts.handleOrderEvent(job.data.eventId, job.name, toOrderEventPayload(job.name, payload));
      await this.deliveryFacts.handleDeliveryEvent(job.data.eventId, job.name, payload);
      return;
    }
    if (RELATIONSHIP_EVENT_TYPES.has(job.name)) {
      await this.relationshipFacts.handleRelationshipEvent(job.data.eventId, job.name, job.data.payload as RelationshipEventPayload);
      return;
    }
    this.logger.warn(`No analytics-facts handler for event type '${job.name}' (event ${job.data.eventId}); ignoring`);
  }
}
