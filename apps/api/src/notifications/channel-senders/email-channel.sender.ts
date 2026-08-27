import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification, NotificationAudience, NotificationChannel, NotificationDelivery, NotificationType } from '@prisma/client';
import { MailService } from '../../mail/mail.service';
import { CustomerInviteNotificationPayload, DeliveryOutcomeNotificationPayload, OrderPlacedNotificationPayload, TradeRelationshipNotificationPayload } from '../notification-payload';
import { ChannelSender } from './channel-sender.interface';

@Injectable()
export class EmailChannelSender implements ChannelSender {
  readonly channel = NotificationChannel.EMAIL;

  private readonly adminUrl: string;
  private readonly portalUrl: string;

  constructor(
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.adminUrl = config.getOrThrow<string>('ADMIN_URL');
    this.portalUrl = config.getOrThrow<string>('PORTAL_URL');
  }

  async send(delivery: NotificationDelivery, notification: Notification): Promise<void> {
    if (notification.type === NotificationType.CUSTOMER_INVITE_SENT) {
      const invitePayload = notification.payload as unknown as CustomerInviteNotificationPayload;
      await this.mail.sendInvite(delivery.recipient, {
        distributorName: invitePayload.distributorName,
        customerName: invitePayload.customerName,
        inviteUrl: invitePayload.inviteUrl,
        recipientEmail: invitePayload.recipientEmail,
        expiresAt: new Date(invitePayload.expiresAt),
        distributorLogoUrl: invitePayload.distributorLogoUrl,
        distributorEmail: invitePayload.distributorEmail,
        distributorPhone: invitePayload.distributorPhone,
      });
      return;
    }

    if (
      notification.type === NotificationType.TRADE_RELATIONSHIP_REQUEST_ACCEPTED ||
      notification.type === NotificationType.TRADE_RELATIONSHIP_REQUEST_DECLINED ||
      notification.type === NotificationType.TRADE_RELATIONSHIP_SUSPENDED ||
      notification.type === NotificationType.TRADE_RELATIONSHIP_UNSUSPENDED ||
      notification.type === NotificationType.TRADE_RELATIONSHIP_ACTIVATED
    ) {
      const relPayload = notification.payload as unknown as TradeRelationshipNotificationPayload;
      const params = {
        distributorName: relPayload.distributorName,
        distributorEmail: relPayload.distributorEmail,
        distributorPhone: relPayload.distributorPhone,
        distributorLogoUrl: relPayload.distributorLogoUrl,
        portalUrl: relPayload.portalUrl,
      };
      switch (notification.type) {
        case NotificationType.TRADE_RELATIONSHIP_REQUEST_ACCEPTED:
          await this.mail.sendTradeRelationshipRequestAccepted(delivery.recipient, params);
          break;
        case NotificationType.TRADE_RELATIONSHIP_REQUEST_DECLINED:
          await this.mail.sendTradeRelationshipRequestDeclined(delivery.recipient, params);
          break;
        case NotificationType.TRADE_RELATIONSHIP_SUSPENDED:
          await this.mail.sendTradeRelationshipSuspended(delivery.recipient, params);
          break;
        case NotificationType.TRADE_RELATIONSHIP_UNSUSPENDED:
          await this.mail.sendTradeRelationshipUnsuspended(delivery.recipient, params);
          break;
        default:
          await this.mail.sendTradeRelationshipActivated(delivery.recipient, params);
      }
      return;
    }

    if (notification.type === NotificationType.ORDER_DELIVERED || notification.type === NotificationType.ORDER_DELIVERY_FAILED) {
      const deliveryPayload = notification.payload as unknown as DeliveryOutcomeNotificationPayload;
      const orderUrl = deliveryPayload.distributorSlug
        ? `${this.portalUrl}/${deliveryPayload.distributorSlug}/orders/${deliveryPayload.orderId}`
        : null;
      const common = {
        distributorName: deliveryPayload.distributorName,
        distributorEmail: deliveryPayload.distributorEmail,
        distributorPhone: deliveryPayload.distributorPhone,
        distributorLogoUrl: deliveryPayload.distributorLogoUrl,
        orderNumber: deliveryPayload.orderNumber,
      };
      const isDistributor = delivery.audience === NotificationAudience.DISTRIBUTOR;

      if (notification.type === NotificationType.ORDER_DELIVERED) {
        if (isDistributor) {
          await this.mail.sendOrderDeliveredToDistributor(delivery.recipient, {
            ...common,
            orderUrl: `${this.adminUrl}/orders/${deliveryPayload.orderId}`,
            customerName: deliveryPayload.customerName,
            driverName: deliveryPayload.driverName,
          });
        } else {
          await this.mail.sendOrderDeliveredToCustomer(delivery.recipient, { ...common, orderUrl });
        }
        return;
      }

      if (isDistributor) {
        await this.mail.sendOrderDeliveryFailedToDistributor(delivery.recipient, {
          ...common,
          orderUrl: `${this.adminUrl}/orders/${deliveryPayload.orderId}`,
          customerName: deliveryPayload.customerName,
          unableReason: deliveryPayload.unableReason,
        });
      } else {
        await this.mail.sendOrderDeliveryFailedToCustomer(delivery.recipient, {
          ...common,
          orderUrl,
          unableReason: deliveryPayload.unableReason,
        });
      }
      return;
    }

    const payload = notification.payload as unknown as OrderPlacedNotificationPayload;

    if (delivery.audience === NotificationAudience.DISTRIBUTOR) {
      await this.mail.sendOrderPlacedToDistributor(delivery.recipient, {
        customerName: payload.customerName,
        orderNumber: payload.orderNumber,
        orderUrl: `${this.adminUrl}/orders/${payload.orderId}`,
        totalAmount: payload.totalAmount,
        currency: payload.currency,
        requestedDeliveryDate: payload.requestedDeliveryDate,
        customerReference: payload.customerReference,
        lineItemCount: payload.lineItemCount,
        orderLines: payload.orderLines,
      });
      return;
    }

    // Only the distributor's copy got an order link before this — the
    // customer's didn't link anywhere at all. Needs a slug to build a real
    // portal route (distributors/:slug/orders/:id); omit rather than link
    // somewhere broken if one isn't set.
    const orderUrl = payload.distributorSlug ? `${this.portalUrl}/${payload.distributorSlug}/orders/${payload.orderId}` : null;
    const customerParams = {
      distributorName: payload.distributorName,
      distributorEmail: payload.distributorEmail,
      distributorPhone: payload.distributorPhone,
      distributorLogoUrl: payload.distributorLogoUrl,
      orderNumber: payload.orderNumber,
      orderUrl,
    };

    if (payload.autoAccepted) {
      await this.mail.sendOrderConfirmedToCustomer(delivery.recipient, customerParams);
    } else {
      await this.mail.sendOrderReceivedToCustomer(delivery.recipient, customerParams);
    }
  }
}
