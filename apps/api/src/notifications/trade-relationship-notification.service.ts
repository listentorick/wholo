import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, NotificationDeliveryStatus, NotificationType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { TradeRelationshipNotificationPayload } from './notification-payload';

export interface TradeRelationshipEventPayload {
  relationshipId: string;
  distributorId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  distributorName: string;
  portalUrl: string | null;
}

@Injectable()
export class TradeRelationshipNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  async handleTradeRelationshipRequestAccepted(event: TradeRelationshipEventPayload, eventId: string): Promise<void> {
    return this.handle(event, eventId, NotificationType.TRADE_RELATIONSHIP_REQUEST_ACCEPTED, 'ACCEPTED');
  }

  async handleTradeRelationshipRequestDeclined(event: TradeRelationshipEventPayload, eventId: string): Promise<void> {
    return this.handle(event, eventId, NotificationType.TRADE_RELATIONSHIP_REQUEST_DECLINED, 'DECLINED');
  }

  async handleTradeRelationshipSuspended(event: TradeRelationshipEventPayload, eventId: string): Promise<void> {
    return this.handle(event, eventId, NotificationType.TRADE_RELATIONSHIP_SUSPENDED, 'SUSPENDED');
  }

  async handleTradeRelationshipUnsuspended(event: TradeRelationshipEventPayload, eventId: string): Promise<void> {
    return this.handle(event, eventId, NotificationType.TRADE_RELATIONSHIP_UNSUSPENDED, 'UNSUSPENDED');
  }

  async handleTradeRelationshipActivated(event: TradeRelationshipEventPayload, eventId: string): Promise<void> {
    return this.handle(event, eventId, NotificationType.TRADE_RELATIONSHIP_ACTIVATED, 'ACTIVATED');
  }

  // Dedupe on the outbox event's own id, not relationshipId — unlike an
  // invite (one row per invitation), the same relationship can be suspended
  // and unsuspended repeatedly, and each occurrence must send its own email.
  // Keying on relationshipId alone (the invite pattern) would silently
  // swallow every occurrence after the first.
  private async handle(
    event: TradeRelationshipEventPayload,
    eventId: string,
    type: NotificationType,
    label: string,
  ): Promise<void> {
    if (!event.customerEmail) return;

    const payload: TradeRelationshipNotificationPayload = {
      relationshipId: event.relationshipId,
      distributorName: event.distributorName,
      portalUrl: event.portalUrl,
    };

    const dedupeKey = `TRADE_RELATIONSHIP:${label}:${eventId}`;

    const notification = await this.prisma.notification.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        type,
        distributorId: event.distributorId,
        dedupeKey,
        payload: { ...payload },
      },
    });

    await this.prisma.notificationDelivery.createMany({
      data: [
        {
          notificationId: notification.id,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.CUSTOMER,
          recipient: event.customerEmail,
        },
      ],
      skipDuplicates: true,
    });

    const pendingDeliveries = await this.prisma.notificationDelivery.findMany({
      where: { notificationId: notification.id, status: NotificationDeliveryStatus.PENDING },
      select: { id: true },
    });

    for (const delivery of pendingDeliveries) {
      await this.deliveryQueue.add('deliver', { deliveryId: delivery.id }, { jobId: delivery.id });
    }
  }
}
