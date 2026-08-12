import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, NotificationDeliveryStatus, NotificationType } from '@prisma/client';
import { Queue } from 'bullmq';
import { R2StorageService } from '../asset-images/r2-storage.service';
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
  distributorEmail: string | null;
  distributorPhone: string | null;
  portalUrl: string | null;
}

@Injectable()
export class TradeRelationshipNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Storage: R2StorageService,
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

    // Resolved here rather than carried on the outbox event, same rationale
    // as CustomerInviteNotificationService: the logo can change between when
    // the status transition happens and when a retried delivery actually
    // renders the email.
    const logoImage = await this.prisma.assetImage.findFirst({
      where: { assetType: 'distributor-logo', entityId: event.distributorId },
    });
    const distributorLogoUrl = logoImage
      ? this.r2Storage.getPublicUrl((logoImage.variants as Record<string, string>).full)
      : null;

    const payload: TradeRelationshipNotificationPayload = {
      relationshipId: event.relationshipId,
      distributorName: event.distributorName,
      distributorEmail: event.distributorEmail,
      distributorPhone: event.distributorPhone,
      distributorLogoUrl,
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
