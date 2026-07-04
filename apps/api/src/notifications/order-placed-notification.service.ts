import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  OrderAcceptanceMode,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { OrderPlacedNotificationPayload } from './notification-payload';

export interface OrderSubmittedEventPayload {
  orderId: string;
  distributorId: string;
  traderCustomerId: string;
  placedByUserId: string;
  isOrderedByDelegate?: boolean;
  acceptanceModeSnapshot?: OrderAcceptanceMode;
  orderNumber: string;
}

@Injectable()
export class OrderPlacedNotificationService {
  private readonly logger = new Logger(OrderPlacedNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  // Idempotent under at-least-once event delivery: Notification is upserted on
  // dedupeKey, deliveries use createMany+skipDuplicates against the
  // (notificationId, channel, recipient) unique, and delivery jobs use
  // jobId = delivery.id so re-enqueueing is a no-op.
  async handleOrderSubmitted(event: OrderSubmittedEventPayload): Promise<void> {
    const [distributor, settings, customer] = await Promise.all([
      this.prisma.organisation.findUnique({
        where: { id: event.distributorId },
        select: { name: true, email: true },
      }),
      this.prisma.distributorSettings.findUnique({
        where: { distributorId: event.distributorId },
        select: { orderNotificationEmails: true },
      }),
      this.prisma.organisation.findUnique({
        where: { id: event.traderCustomerId },
        select: { name: true, email: true },
      }),
    ]);

    if (!distributor || !customer) {
      this.logger.warn(
        `Skipping ORDER_PLACED notification for order ${event.orderId}: ` +
          `${!distributor ? 'distributor' : 'customer'} organisation not found`,
      );
      return;
    }

    const distributorRecipients = this.resolveDistributorRecipients(
      event,
      settings?.orderNotificationEmails ?? [],
      distributor.email,
    );
    const customerRecipient = await this.resolveCustomerRecipient(event, customer.email);

    if (distributorRecipients.length === 0 && !customerRecipient) {
      this.logger.warn(`No recipients resolvable for ORDER_PLACED on order ${event.orderId}; nothing to send`);
      return;
    }

    const payload: OrderPlacedNotificationPayload = {
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      distributorName: distributor.name,
      customerName: customer.name,
      autoAccepted: event.acceptanceModeSnapshot === OrderAcceptanceMode.AUTO_ON_SUBMISSION,
      placedByUserId: event.placedByUserId,
    };

    const notification = await this.prisma.notification.upsert({
      where: { dedupeKey: `ORDER_PLACED:${event.orderId}` },
      update: {},
      create: {
        type: NotificationType.ORDER_PLACED,
        distributorId: event.distributorId,
        orderId: event.orderId,
        dedupeKey: `ORDER_PLACED:${event.orderId}`,
        payload: { ...payload },
      },
    });

    await this.prisma.notificationDelivery.createMany({
      data: [
        ...distributorRecipients.map((recipient) => ({
          notificationId: notification.id,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.DISTRIBUTOR,
          recipient,
        })),
        ...(customerRecipient
          ? [
              {
                notificationId: notification.id,
                channel: NotificationChannel.EMAIL,
                audience: NotificationAudience.CUSTOMER,
                recipient: customerRecipient,
              },
            ]
          : []),
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

  private resolveDistributorRecipients(
    event: OrderSubmittedEventPayload,
    orderNotificationEmails: string[],
    distributorOrgEmail: string | null,
  ): string[] {
    if (orderNotificationEmails.length > 0) return orderNotificationEmails;
    if (distributorOrgEmail) return [distributorOrgEmail];

    this.logger.warn(
      `Distributor ${event.distributorId} has no orderNotificationEmails and no organisation email; ` +
        `skipping distributor notification for order ${event.orderId}`,
    );
    return [];
  }

  private async resolveCustomerRecipient(
    event: OrderSubmittedEventPayload,
    customerOrgEmail: string | null,
  ): Promise<string | null> {
    // Delegate orders go to the org, not the delegate. Events written before
    // placedByUserId existed in the payload (pre-ADR-047 replays) also fall
    // back to the org email rather than failing recipient lookup.
    if (event.isOrderedByDelegate || !event.placedByUserId) {
      if (customerOrgEmail) return customerOrgEmail;
      this.logger.warn(
        `Order ${event.orderId}: customer organisation ${event.traderCustomerId} has no email; ` +
          `skipping customer notification`,
      );
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: event.placedByUserId },
      select: { email: true },
    });
    if (user?.email) return user.email;

    this.logger.warn(
      `Placing user ${event.placedByUserId} not found or has no email; skipping customer notification ` +
        `for order ${event.orderId}`,
    );
    return null;
  }
}
