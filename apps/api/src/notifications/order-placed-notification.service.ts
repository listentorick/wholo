import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  OrderAcceptanceMode,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { OrderLineSnapshot, OrderPlacedNotificationPayload } from './notification-payload';

export interface OrderSubmittedEventPayload {
  orderId: string;
  distributorId: string;
  traderCustomerId: string;
  placedByUserId: string;
  isOrderedByDelegate?: boolean;
  acceptanceModeSnapshot?: OrderAcceptanceMode;
  orderNumber: string;
  // Distributor-notification content, snapshotted at submit() time (see
  // orders.service.ts) rather than re-queried here — already in scope there
  // at zero extra cost. Optional: events written before this field existed
  // (pre-this-change replays) fall back gracefully in the template.
  totalAmount?: string;
  currency?: string;
  requestedDeliveryDate?: string | null;
  customerReference?: string | null;
  lineItemCount?: number;
  orderLines?: OrderLineSnapshot[];
}

@Injectable()
export class OrderPlacedNotificationService {
  private readonly logger = new Logger(OrderPlacedNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
    private readonly adminNotifications: AdminNotificationsService,
    private readonly r2Storage: R2StorageService,
  ) {}

  // Idempotent under at-least-once event delivery: Notification is upserted on
  // dedupeKey, deliveries use createMany+skipDuplicates against the
  // (notificationId, channel, recipient) unique, and delivery jobs use
  // jobId = delivery.id so re-enqueueing is a no-op.
  async handleOrderSubmitted(event: OrderSubmittedEventPayload): Promise<void> {
    const [distributor, settings, customer, logoImage] = await Promise.all([
      this.prisma.organisation.findUnique({
        where: { id: event.distributorId },
        select: { name: true, email: true, phone: true, slug: true },
      }),
      this.prisma.distributorSettings.findUnique({
        where: { distributorId: event.distributorId },
        select: { orderNotificationEmails: true },
      }),
      this.prisma.organisation.findUnique({
        where: { id: event.traderCustomerId },
        select: { name: true, email: true },
      }),
      // Resolved here rather than carried on the outbox event, same
      // rationale as CustomerInviteNotificationService — the logo can
      // change between order placement and a retried delivery.
      this.prisma.assetImage.findFirst({
        where: { assetType: 'distributor-logo', entityId: event.distributorId },
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

    const distributorLogoUrl = logoImage
      ? this.r2Storage.getPublicUrl((logoImage.variants as Record<string, string>).full)
      : null;

    const payload: OrderPlacedNotificationPayload = {
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      distributorName: distributor.name,
      distributorEmail: distributor.email,
      distributorPhone: distributor.phone,
      distributorSlug: distributor.slug,
      distributorLogoUrl,
      customerName: customer.name,
      autoAccepted: event.acceptanceModeSnapshot === OrderAcceptanceMode.AUTO_ON_SUBMISSION,
      placedByUserId: event.placedByUserId,
      totalAmount: event.totalAmount ?? null,
      currency: event.currency ?? null,
      requestedDeliveryDate: event.requestedDeliveryDate ?? null,
      customerReference: event.customerReference ?? null,
      lineItemCount: event.lineItemCount ?? null,
      orderLines: event.orderLines ?? null,
    };

    const notification = await this.prisma.notification.upsert({
      where: { dedupeKey: `ORDER_PLACED:${event.orderId}` },
      update: {},
      create: {
        type: NotificationType.ORDER_PLACED,
        distributorId: event.distributorId,
        orderId: event.orderId,
        dedupeKey: `ORDER_PLACED:${event.orderId}`,
        // orderLines (an array of the named OrderLineSnapshot interface) is
        // still plain JSON-serializable data — Prisma's InputJsonValue just
        // doesn't structurally match a named interface array the way it
        // matches inline object/array literals; the runtime value is fine.
        payload: { ...payload } as Prisma.InputJsonValue,
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

    // Placed last (after everything else that could throw has already
    // committed) so a BullMQ retry of this job — which would otherwise
    // duplicate these rows, since AdminNotification has no dedupe key — only
    // replays work that hasn't actually succeeded yet.
    await this.adminNotifications.notifyOrganisationAdmins(event.distributorId, {
      type: 'ORDER_PLACED',
      title: 'New order placed',
      body: `${customer.name} placed order ${event.orderNumber}`,
      linkPath: `/orders/${event.orderId}`,
      payload: { orderId: event.orderId, orderNumber: event.orderNumber },
    });
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
