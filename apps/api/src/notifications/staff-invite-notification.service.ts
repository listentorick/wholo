import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, NotificationDeliveryStatus, NotificationType, Role } from '@prisma/client';
import { ROLE_LABELS, Role as SharedRole } from '@wholo/types';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { StaffInviteNotificationPayload } from './notification-payload';

export interface StaffInviteSentEventPayload {
  invitationId: string;
  distributorId: string;
  email: string;
  roles: Role[];
  distributorName: string;
  distributorEmail: string | null;
  distributorPhone: string | null;
  inviterName: string;
  inviteUrl: string;
  expiresAt: string;
}

@Injectable()
export class StaffInviteNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  // Idempotent under at-least-once event delivery, same as
  // CustomerInviteNotificationService: Notification upserted on dedupeKey,
  // delivery job uses jobId = delivery.id so re-enqueueing is a no-op. A
  // resend is a NEW invitation (new id), so it gets its own notification.
  async handleStaffInviteSent(event: StaffInviteSentEventPayload): Promise<void> {
    const payload: StaffInviteNotificationPayload = {
      invitationId: event.invitationId,
      distributorName: event.distributorName,
      inviterName: event.inviterName,
      roleLabels: event.roles.map((r) => ROLE_LABELS[r as unknown as SharedRole] ?? r),
      recipientEmail: event.email,
      inviteUrl: event.inviteUrl,
      expiresAt: event.expiresAt,
    };

    const dedupeKey = `STAFF_INVITE:${event.invitationId}`;

    const notification = await this.prisma.notification.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        type: NotificationType.STAFF_INVITE_SENT,
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
          // The invitee is a distributor-side person (an employee), not a trade customer.
          audience: NotificationAudience.DISTRIBUTOR,
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
