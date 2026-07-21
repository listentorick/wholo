import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification, NotificationAudience, NotificationChannel, NotificationDelivery, NotificationType } from '@prisma/client';
import { MailService } from '../../mail/mail.service';
import { CustomerInviteNotificationPayload, OrderPlacedNotificationPayload } from '../notification-payload';
import { ChannelSender } from './channel-sender.interface';

@Injectable()
export class EmailChannelSender implements ChannelSender {
  readonly channel = NotificationChannel.EMAIL;

  private readonly adminUrl: string;

  constructor(
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.adminUrl = config.get<string>('ADMIN_URL', 'http://localhost:3020');
  }

  async send(delivery: NotificationDelivery, notification: Notification): Promise<void> {
    if (notification.type === NotificationType.CUSTOMER_INVITE_SENT) {
      const invitePayload = notification.payload as unknown as CustomerInviteNotificationPayload;
      await this.mail.sendInvite(delivery.recipient, invitePayload.distributorName, invitePayload.inviteUrl);
      return;
    }

    const payload = notification.payload as unknown as OrderPlacedNotificationPayload;

    if (delivery.audience === NotificationAudience.DISTRIBUTOR) {
      await this.mail.sendOrderPlacedToDistributor(delivery.recipient, {
        customerName: payload.customerName,
        orderNumber: payload.orderNumber,
        orderUrl: `${this.adminUrl}/orders/${payload.orderId}`,
      });
      return;
    }

    if (payload.autoAccepted) {
      await this.mail.sendOrderConfirmedToCustomer(delivery.recipient, {
        distributorName: payload.distributorName,
        orderNumber: payload.orderNumber,
      });
    } else {
      await this.mail.sendOrderReceivedToCustomer(delivery.recipient, {
        distributorName: payload.distributorName,
        orderNumber: payload.orderNumber,
      });
    }
  }
}
