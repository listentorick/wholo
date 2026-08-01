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
      sendTradeRelationshipRequestAccepted: jest.fn().mockResolvedValue(undefined),
      sendTradeRelationshipRequestDeclined: jest.fn().mockResolvedValue(undefined),
      sendTradeRelationshipSuspended: jest.fn().mockResolvedValue(undefined),
      sendTradeRelationshipUnsuspended: jest.fn().mockResolvedValue(undefined),
      sendTradeRelationshipActivated: jest.fn().mockResolvedValue(undefined),
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

  const tradeRelationshipCases = [
    { type: NotificationType.TRADE_RELATIONSHIP_REQUEST_ACCEPTED, method: 'sendTradeRelationshipRequestAccepted' as const },
    { type: NotificationType.TRADE_RELATIONSHIP_REQUEST_DECLINED, method: 'sendTradeRelationshipRequestDeclined' as const },
    { type: NotificationType.TRADE_RELATIONSHIP_SUSPENDED, method: 'sendTradeRelationshipSuspended' as const },
    { type: NotificationType.TRADE_RELATIONSHIP_UNSUSPENDED, method: 'sendTradeRelationshipUnsuspended' as const },
    { type: NotificationType.TRADE_RELATIONSHIP_ACTIVATED, method: 'sendTradeRelationshipActivated' as const },
  ];

  for (const { type, method } of tradeRelationshipCases) {
    it(`routes ${type} notifications to MailService.${method}`, async () => {
      const notification = {
        type,
        payload: { relationshipId: 'rel-1', distributorName: 'Vinos Direct', portalUrl: 'http://localhost:3010/vinos-direct' },
      } as unknown as Notification;

      await sender.send(makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'), notification);

      expect(mail[method]).toHaveBeenCalledWith('buyer@winebar.example', {
        distributorName: 'Vinos Direct',
        portalUrl: 'http://localhost:3010/vinos-direct',
      });
      for (const { method: otherMethod } of tradeRelationshipCases) {
        if (otherMethod !== method) expect(mail[otherMethod]).not.toHaveBeenCalled();
      }
    });
  }
});
