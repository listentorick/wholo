import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from '../queues/queue.constants';
import { CustomerInviteNotificationService, CustomerInviteSentEventPayload } from './customer-invite-notification.service';
import { OrderPlacedNotificationService, OrderSubmittedEventPayload } from './order-placed-notification.service';
import { TradeRelationshipEventPayload, TradeRelationshipNotificationService } from './trade-relationship-notification.service';

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

  constructor(
    private readonly orderPlaced: OrderPlacedNotificationService,
    private readonly customerInvite: CustomerInviteNotificationService,
    private readonly tradeRelationship: TradeRelationshipNotificationService,
  ) {
    super();
  }

  async process(job: Job<OutboxEventJobData>): Promise<void> {
    if (job.name === 'OrderSubmitted') {
      await this.orderPlaced.handleOrderSubmitted(job.data.payload as OrderSubmittedEventPayload);
      return;
    }
    if (job.name === 'CustomerInviteSent') {
      await this.customerInvite.handleCustomerInviteSent(job.data.payload as CustomerInviteSentEventPayload);
      return;
    }
    if (job.name === 'TradeRelationshipRequestAccepted') {
      await this.tradeRelationship.handleTradeRelationshipRequestAccepted(job.data.payload as TradeRelationshipEventPayload, job.data.eventId);
      return;
    }
    if (job.name === 'TradeRelationshipRequestDeclined') {
      await this.tradeRelationship.handleTradeRelationshipRequestDeclined(job.data.payload as TradeRelationshipEventPayload, job.data.eventId);
      return;
    }
    if (job.name === 'TradeRelationshipSuspended') {
      await this.tradeRelationship.handleTradeRelationshipSuspended(job.data.payload as TradeRelationshipEventPayload, job.data.eventId);
      return;
    }
    if (job.name === 'TradeRelationshipUnsuspended') {
      await this.tradeRelationship.handleTradeRelationshipUnsuspended(job.data.payload as TradeRelationshipEventPayload, job.data.eventId);
      return;
    }
    if (job.name === 'TradeRelationshipActivated') {
      await this.tradeRelationship.handleTradeRelationshipActivated(job.data.payload as TradeRelationshipEventPayload, job.data.eventId);
      return;
    }
    this.logger.warn(`No notification handler for event type '${job.name}' (event ${job.data.eventId}); ignoring`);
  }
}
