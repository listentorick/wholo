import { ConfigService } from '@nestjs/config';
import { Notification, NotificationAudience, NotificationChannel, NotificationDelivery, NotificationType } from '@prisma/client';
import { MailService } from '../../mail/mail.service';
import { EmailChannelSender } from './email-channel.sender';

const basePayload = {
  orderId: 'order-1',
  orderNumber: 'ORD-2026-00042',
  distributorName: 'Vinos Direct',
  customerName: 'The Wine Bar',
  autoAccepted: false,
  placedByUserId: 'user-1',
};

function makeDelivery(audience: NotificationAudience, recipient = 'someone@example.com'): NotificationDelivery {
  return { audience, recipient, channel: NotificationChannel.EMAIL } as NotificationDelivery;
}

function makeNotification(payloadOverrides: Partial<typeof basePayload> = {}): Notification {
  return { payload: { ...basePayload, ...payloadOverrides } } as unknown as Notification;
}

describe('EmailChannelSender', () => {
  let sender: EmailChannelSender;
  let mail: jest.Mocked<MailService>;

  beforeEach(() => {
    mail = {
      sendOrderPlacedToDistributor: jest.fn().mockResolvedValue(undefined),
      sendOrderReceivedToCustomer: jest.fn().mockResolvedValue(undefined),
      sendOrderConfirmedToCustomer: jest.fn().mockResolvedValue(undefined),
      sendInvite: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MailService>;

    const config = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    } as unknown as ConfigService;

    sender = new EmailChannelSender(mail, config);
  });

  it('sends the distributor email with an admin order link', async () => {
    await sender.send(makeDelivery(NotificationAudience.DISTRIBUTOR, 'ops@vinos.example'), makeNotification());

    expect(mail.sendOrderPlacedToDistributor).toHaveBeenCalledWith('ops@vinos.example', {
      customerName: 'The Wine Bar',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3020/orders/order-1',
    });
  });

  it('sends the received email to customers for manually-accepted orders', async () => {
    await sender.send(makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'), makeNotification());

    expect(mail.sendOrderReceivedToCustomer).toHaveBeenCalledWith('buyer@winebar.example', {
      distributorName: 'Vinos Direct',
      orderNumber: 'ORD-2026-00042',
    });
    expect(mail.sendOrderConfirmedToCustomer).not.toHaveBeenCalled();
  });

  it('sends the confirmed email to customers for auto-accepted orders', async () => {
    await sender.send(
      makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'),
      makeNotification({ autoAccepted: true }),
    );

    expect(mail.sendOrderConfirmedToCustomer).toHaveBeenCalledWith('buyer@winebar.example', {
      distributorName: 'Vinos Direct',
      orderNumber: 'ORD-2026-00042',
    });
    expect(mail.sendOrderReceivedToCustomer).not.toHaveBeenCalled();
  });

  it('sends the invite email for CUSTOMER_INVITE_SENT notifications', async () => {
    const notification = {
      type: NotificationType.CUSTOMER_INVITE_SENT,
      payload: {
        invitationId: 'inv-1',
        distributorName: 'Vinos Direct',
        inviteUrl: 'http://localhost:3010/accept-invite?token=abc',
      },
    } as unknown as Notification;

    await sender.send(makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'), notification);

    expect(mail.sendInvite).toHaveBeenCalledWith(
      'buyer@winebar.example',
      'Vinos Direct',
      'http://localhost:3010/accept-invite?token=abc',
    );
    expect(mail.sendOrderReceivedToCustomer).not.toHaveBeenCalled();
    expect(mail.sendOrderConfirmedToCustomer).not.toHaveBeenCalled();
  });
});
