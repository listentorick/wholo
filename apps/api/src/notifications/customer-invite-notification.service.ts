import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, NotificationDeliveryStatus, NotificationType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { CustomerInviteNotificationPayload } from './notification-payload';

export interface CustomerInviteSentEventPayload {
  invitationId: string;
  distributorId: string;
  email: string;
  distributorName: string;
  inviteUrl: string;
}

@Injectable()
export class CustomerInviteNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  // Idempotent under at-least-once event delivery, same as
  // OrderPlacedNotificationService: Notification upserted on dedupeKey,
  // delivery job uses jobId = delivery.id so re-enqueueing is a no-op. The
  // recipient is already explicit on the event (unlike order placement),
  // so there's no recipient-resolution step here.
  async handleCustomerInviteSent(event: CustomerInviteSentEventPayload): Promise<void> {
    const payload: CustomerInviteNotificationPayload = {
      invitationId: event.invitationId,
      distributorName: event.distributorName,
      inviteUrl: event.inviteUrl,
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
