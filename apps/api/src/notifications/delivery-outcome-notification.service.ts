import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, NotificationDeliveryStatus, NotificationType, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queues/queue.constants';
import { DeliveryOutcomeNotificationPayload, OrderDeliveryOutcomeEventPayload } from './notification-payload';

// Delivered and Unable-to-deliver are handled together — same recipients,
// same resolution logic, same shape, differing only in NotificationType and
// which email variant EmailChannelSender ultimately calls. Mirrors
// TradeRelationshipNotificationService's one-class-several-events shape
// rather than splitting into two near-identical services.
@Injectable()
export class DeliveryOutcomeNotificationService {
  private readonly logger = new Logger(DeliveryOutcomeNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
    private readonly r2Storage: R2StorageService,
  ) {}

  async handleOrderDelivered(event: OrderDeliveryOutcomeEventPayload): Promise<void> {
    await this.handle(event, NotificationType.ORDER_DELIVERED, 'ORDER_DELIVERED');
  }

  async handleOrderDeliveryFailed(event: OrderDeliveryOutcomeEventPayload): Promise<void> {
    await this.handle(event, NotificationType.ORDER_DELIVERY_FAILED, 'ORDER_DELIVERY_FAILED');
  }

  // Idempotent under at-least-once event delivery — same discipline as
  // OrderPlacedNotificationService: Notification upserted on dedupeKey,
  // deliveries createMany+skipDuplicates, delivery jobs use jobId = delivery.id.
  private async handle(
    event: OrderDeliveryOutcomeEventPayload,
    type: NotificationType,
    dedupePrefix: string,
  ): Promise<void> {
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
      this.prisma.assetImage.findFirst({
        where: { assetType: 'distributor-logo', entityId: event.distributorId },
      }),
    ]);

    if (!distributor || !customer) {
      this.logger.warn(
        `Skipping ${type} notification for order ${event.orderId}: ` +
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
      this.logger.warn(`No recipients resolvable for ${type} on order ${event.orderId}; nothing to send`);
      return;
    }

    const distributorLogoUrl = logoImage
      ? this.r2Storage.getPublicUrl((logoImage.variants as Record<string, string>).full)
      : null;

    const payload: DeliveryOutcomeNotificationPayload = {
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      distributorName: distributor.name,
      distributorEmail: distributor.email,
      distributorPhone: distributor.phone,
      distributorLogoUrl,
      distributorSlug: distributor.slug,
      customerName: customer.name,
      driverName: event.driverName,
      recordedAt: event.recordedAt,
      unableReason: event.unableReason,
    };

    const dedupeKey = `${dedupePrefix}:${event.orderId}`;
    const notification = await this.prisma.notification.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        type,
        distributorId: event.distributorId,
        orderId: event.orderId,
        dedupeKey,
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
  }

  private resolveDistributorRecipients(
    event: OrderDeliveryOutcomeEventPayload,
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
    event: OrderDeliveryOutcomeEventPayload,
    customerOrgEmail: string | null,
  ): Promise<string | null> {
    // Delegate orders go to the org, not the delegate — same rule as
    // OrderPlacedNotificationService.
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
