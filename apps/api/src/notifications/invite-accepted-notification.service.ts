import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, NotificationDeliveryStatus, NotificationType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { InviteAcceptedNotificationPayload } from './notification-payload';

/** The acceptance fields both invitation types add to their accepted event (ADR-081). */
interface InviteAcceptedFields {
  invitationId: string;
  distributorId: string;
  invitationEmail: string;
  acceptedByName: string;
  acceptedByEmail: string;
  acceptedWithCode: boolean;
  distributorName: string;
  distributorEmail: string | null;
  distributorPhone: string | null;
}

/** CustomerInviteAccepted: relationship lifecycle fields (ignored here) plus these. */
export interface CustomerInviteAcceptedEventPayload extends InviteAcceptedFields {
  customerName: string;
}

export type StaffInviteAcceptedEventPayload = InviteAcceptedFields;

/**
 * Tells an invitation's address that it was accepted by ANOTHER login, with a
 * code (ADR-081), so the owner of that mailbox notices if they didn't mean to
 * approve it. Not sent when the invited address accepted for itself: that
 * person already knows. Events written before ADR-081 carry no invitationEmail
 * and are skipped.
 *
 * Idempotent like the invite-sent services: Notification upserted on a
 * dedupe key per invitation, delivery jobs keyed by delivery id.
 */
@Injectable()
export class InviteAcceptedNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  handleCustomerInviteAccepted(event: CustomerInviteAcceptedEventPayload): Promise<void> {
    return this.notify(event, {
      type: NotificationType.CUSTOMER_INVITE_ACCEPTED,
      audience: NotificationAudience.CUSTOMER,
      dedupeKey: `CUSTOMER_INVITE_ACCEPTED:${event.invitationId}`,
      businessName: event.customerName,
      distributorName: event.distributorName,
    });
  }

  handleStaffInviteAccepted(event: StaffInviteAcceptedEventPayload): Promise<void> {
    return this.notify(event, {
      type: NotificationType.STAFF_INVITE_ACCEPTED,
      audience: NotificationAudience.DISTRIBUTOR,
      dedupeKey: `STAFF_INVITE_ACCEPTED:${event.invitationId}`,
      businessName: event.distributorName,
      distributorName: null,
    });
  }

  private async notify(
    event: InviteAcceptedFields,
    kind: { type: NotificationType; audience: NotificationAudience; dedupeKey: string; businessName: string; distributorName: string | null },
  ): Promise<void> {
    if (!event.invitationEmail || !event.acceptedWithCode) return;

    const payload: InviteAcceptedNotificationPayload = {
      invitationId: event.invitationId,
      businessName: kind.businessName,
      distributorName: kind.distributorName,
      recipientEmail: event.invitationEmail,
      acceptedByName: event.acceptedByName,
      acceptedByEmail: event.acceptedByEmail,
      acceptedWithCode: event.acceptedWithCode,
      contactName: event.distributorName,
      contactEmail: event.distributorEmail,
      contactPhone: event.distributorPhone,
    };

    const notification = await this.prisma.notification.upsert({
      where: { dedupeKey: kind.dedupeKey },
      update: {},
      create: { type: kind.type, distributorId: event.distributorId, dedupeKey: kind.dedupeKey, payload: { ...payload } },
    });

    await this.prisma.notificationDelivery.createMany({
      data: [{ notificationId: notification.id, channel: NotificationChannel.EMAIL, audience: kind.audience, recipient: event.invitationEmail }],
      skipDuplicates: true,
    });

    const pending = await this.prisma.notificationDelivery.findMany({
      where: { notificationId: notification.id, status: NotificationDeliveryStatus.PENDING },
      select: { id: true },
    });
    for (const delivery of pending) {
      await this.deliveryQueue.add('deliver', { deliveryId: delivery.id }, { jobId: delivery.id });
    }
  }
}
