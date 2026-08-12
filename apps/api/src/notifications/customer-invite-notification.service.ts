import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, NotificationDeliveryStatus, NotificationType } from '@prisma/client';
import { Queue } from 'bullmq';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { CustomerInviteNotificationPayload } from './notification-payload';

export interface CustomerInviteSentEventPayload {
  invitationId: string;
  distributorId: string;
  email: string;
  distributorName: string;
  distributorEmail: string | null;
  distributorPhone: string | null;
  customerName: string;
  inviteUrl: string;
  expiresAt: string;
}

@Injectable()
export class CustomerInviteNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Storage: R2StorageService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  // Idempotent under at-least-once event delivery, same as
  // OrderPlacedNotificationService: Notification upserted on dedupeKey,
  // delivery job uses jobId = delivery.id so re-enqueueing is a no-op. The
  // recipient is already explicit on the event (unlike order placement),
  // so there's no recipient-resolution step here.
  async handleCustomerInviteSent(event: CustomerInviteSentEventPayload): Promise<void> {
    // Resolved here rather than carried on the outbox event: the logo can
    // change between when the invite is sent and when a retried delivery
    // actually renders the email, and this keeps the event itself a plain
    // domain fact rather than a presentation snapshot.
    const logoImage = await this.prisma.assetImage.findFirst({
      where: { assetType: 'distributor-logo', entityId: event.distributorId },
    });
    const distributorLogoUrl = logoImage
      ? this.r2Storage.getPublicUrl((logoImage.variants as Record<string, string>).full)
      : null;

    const payload: CustomerInviteNotificationPayload = {
      invitationId: event.invitationId,
      distributorName: event.distributorName,
      distributorEmail: event.distributorEmail,
      distributorPhone: event.distributorPhone,
      distributorLogoUrl,
      customerName: event.customerName,
      recipientEmail: event.email,
      inviteUrl: event.inviteUrl,
      expiresAt: event.expiresAt,
    };

    const dedupeKey = `CUSTOMER_INVITE:${event.invitationId}`;

    const notification = await this.prisma.notification.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        type: NotificationType.CUSTOMER_INVITE_SENT,
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
          recipient: event.email,
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
