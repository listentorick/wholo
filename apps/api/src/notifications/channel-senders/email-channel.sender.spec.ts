import { ConfigService } from '@nestjs/config';
import { Notification, NotificationAudience, NotificationChannel, NotificationDelivery, NotificationType } from '@prisma/client';
import { MailService } from '../../mail/mail.service';
import { EmailChannelSender } from './email-channel.sender';

const basePayload = {
  orderId: 'order-1',
  orderNumber: 'ORD-2026-00042',
  distributorName: 'Vinos Direct',
  distributorEmail: 'orders@vinos.example',
  distributorPhone: '(03) 9123 4567',
  distributorSlug: 'vinos-direct',
  distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
  customerName: 'The Wine Bar',
  autoAccepted: false,
  placedByUserId: 'user-1',
  totalAmount: '842.50',
  currency: 'GBP',
  requestedDeliveryDate: '2026-08-19T00:00:00.000Z',
  customerReference: 'PO-9981',
  lineItemCount: 14,
  orderLines: [{ productName: 'Wine', sku: 'SKU-1', quantity: 2, lineTotal: '24.46' }],
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
      sendOrderDeliveredToCustomer: jest.fn().mockResolvedValue(undefined),
      sendOrderDeliveredToDistributor: jest.fn().mockResolvedValue(undefined),
      sendOrderDeliveryFailedToCustomer: jest.fn().mockResolvedValue(undefined),
      sendOrderDeliveryFailedToDistributor: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MailService>;

    const config = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
      getOrThrow: jest.fn((key: string) => (key === 'ADMIN_URL' ? 'http://localhost:3020' : 'http://localhost:3010')),
    } as unknown as ConfigService;

    sender = new EmailChannelSender(mail, config);
  });

  it('sends the distributor email with an admin order link and the full order-detail summary', async () => {
    await sender.send(makeDelivery(NotificationAudience.DISTRIBUTOR, 'ops@vinos.example'), makeNotification());

    expect(mail.sendOrderPlacedToDistributor).toHaveBeenCalledWith('ops@vinos.example', {
      customerName: 'The Wine Bar',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3020/orders/order-1',
      totalAmount: '842.50',
      currency: 'GBP',
      requestedDeliveryDate: '2026-08-19T00:00:00.000Z',
      customerReference: 'PO-9981',
      lineItemCount: 14,
      orderLines: [{ productName: 'Wine', sku: 'SKU-1', quantity: 2, lineTotal: '24.46' }],
    });
  });

  it('sends the received email to customers for manually-accepted orders, with a portal order link', async () => {
    await sender.send(makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'), makeNotification());

    expect(mail.sendOrderReceivedToCustomer).toHaveBeenCalledWith('buyer@winebar.example', {
      distributorName: 'Vinos Direct',
      distributorEmail: 'orders@vinos.example',
      distributorPhone: '(03) 9123 4567',
      distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3010/vinos-direct/orders/order-1',
    });
    expect(mail.sendOrderConfirmedToCustomer).not.toHaveBeenCalled();
  });

  it('sends the confirmed email to customers for auto-accepted orders, with a portal order link', async () => {
    await sender.send(
      makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'),
      makeNotification({ autoAccepted: true }),
    );

    expect(mail.sendOrderConfirmedToCustomer).toHaveBeenCalledWith('buyer@winebar.example', {
      distributorName: 'Vinos Direct',
      distributorEmail: 'orders@vinos.example',
      distributorPhone: '(03) 9123 4567',
      distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3010/vinos-direct/orders/order-1',
    });
    expect(mail.sendOrderReceivedToCustomer).not.toHaveBeenCalled();
  });

  it('omits the order URL when the distributor has no portal slug', async () => {
    await sender.send(
      makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'),
      makeNotification({ distributorSlug: null as unknown as string }),
    );

    expect(mail.sendOrderReceivedToCustomer).toHaveBeenCalledWith(
      'buyer@winebar.example',
      expect.objectContaining({ orderUrl: null }),
    );
  });

  const deliveryOutcomePayload = {
    orderId: 'order-1',
    orderNumber: 'ORD-2026-00042',
    distributorName: 'Vinos Direct',
    distributorEmail: 'orders@vinos.example',
    distributorPhone: '(03) 9123 4567',
    distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
    distributorSlug: 'vinos-direct',
    customerName: 'The Wine Bar',
    driverName: 'Alex Turner',
    recordedAt: '2026-08-26T09:00:00.000Z',
    unableReason: null as string | null,
  };

  function makeDeliveryOutcomeNotification(type: NotificationType, overrides: Partial<typeof deliveryOutcomePayload> = {}): Notification {
    return { type, payload: { ...deliveryOutcomePayload, ...overrides } } as unknown as Notification;
  }

  it('sends the delivered email to the customer with a portal order link, no driver name', async () => {
    await sender.send(
      makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'),
      makeDeliveryOutcomeNotification(NotificationType.ORDER_DELIVERED),
    );

    expect(mail.sendOrderDeliveredToCustomer).toHaveBeenCalledWith('buyer@winebar.example', {
      distributorName: 'Vinos Direct',
      distributorEmail: 'orders@vinos.example',
      distributorPhone: '(03) 9123 4567',
      distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3010/vinos-direct/orders/order-1',
    });
    expect(mail.sendOrderDeliveredToDistributor).not.toHaveBeenCalled();
  });

  it('sends the delivered email to the distributor with an admin order link and the driver name', async () => {
    await sender.send(
      makeDelivery(NotificationAudience.DISTRIBUTOR, 'ops@vinos.example'),
      makeDeliveryOutcomeNotification(NotificationType.ORDER_DELIVERED),
    );

    expect(mail.sendOrderDeliveredToDistributor).toHaveBeenCalledWith('ops@vinos.example', expect.objectContaining({
      customerName: 'The Wine Bar',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3020/orders/order-1',
      driverName: 'Alex Turner',
    }));
  });

  it('sends the delivery-failed email to the customer, carrying the unable reason', async () => {
    await sender.send(
      makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'),
      makeDeliveryOutcomeNotification(NotificationType.ORDER_DELIVERY_FAILED, { unableReason: 'CUSTOMER_REFUSED' }),
    );

    expect(mail.sendOrderDeliveryFailedToCustomer).toHaveBeenCalledWith('buyer@winebar.example', expect.objectContaining({
      orderNumber: 'ORD-2026-00042',
      unableReason: 'CUSTOMER_REFUSED',
    }));
    expect(mail.sendOrderDeliveredToCustomer).not.toHaveBeenCalled();
  });

  it('sends the delivery-failed email to the distributor, carrying the unable reason', async () => {
    await sender.send(
      makeDelivery(NotificationAudience.DISTRIBUTOR, 'ops@vinos.example'),
      makeDeliveryOutcomeNotification(NotificationType.ORDER_DELIVERY_FAILED, { unableReason: 'INCORRECT_ADDRESS' }),
    );

    expect(mail.sendOrderDeliveryFailedToDistributor).toHaveBeenCalledWith('ops@vinos.example', expect.objectContaining({
      customerName: 'The Wine Bar',
      orderUrl: 'http://localhost:3020/orders/order-1',
      unableReason: 'INCORRECT_ADDRESS',
    }));
  });

  it('sends the invite email for CUSTOMER_INVITE_SENT notifications', async () => {
    const notification = {
      type: NotificationType.CUSTOMER_INVITE_SENT,
      payload: {
        invitationId: 'inv-1',
        distributorName: 'Vinos Direct',
        distributorEmail: 'orders@vinos.example',
        distributorPhone: '(03) 9123 4567',
        distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
        customerName: 'The Wine Bar',
        recipientEmail: 'buyer@winebar.example',
        inviteUrl: 'http://localhost:3010/accept-invite?token=abc',
        expiresAt: '2026-08-19T00:00:00.000Z',
      },
    } as unknown as Notification;

    await sender.send(makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'), notification);

    expect(mail.sendInvite).toHaveBeenCalledWith('buyer@winebar.example', {
      distributorName: 'Vinos Direct',
      customerName: 'The Wine Bar',
      inviteUrl: 'http://localhost:3010/accept-invite?token=abc',
      recipientEmail: 'buyer@winebar.example',
      expiresAt: new Date('2026-08-19T00:00:00.000Z'),
      distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
      distributorEmail: 'orders@vinos.example',
      distributorPhone: '(03) 9123 4567',
    });
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
        payload: {
          relationshipId: 'rel-1',
          distributorName: 'Vinos Direct',
          distributorEmail: 'orders@vinos.example',
          distributorPhone: '(03) 9123 4567',
          distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
          portalUrl: 'http://localhost:3010/vinos-direct',
        },
      } as unknown as Notification;

      await sender.send(makeDelivery(NotificationAudience.CUSTOMER, 'buyer@winebar.example'), notification);

      expect(mail[method]).toHaveBeenCalledWith('buyer@winebar.example', {
        distributorName: 'Vinos Direct',
        distributorEmail: 'orders@vinos.example',
        distributorPhone: '(03) 9123 4567',
        distributorLogoUrl: 'https://cdn.stocdup.com/logo.png',
        portalUrl: 'http://localhost:3010/vinos-direct',
      });
      for (const { method: otherMethod } of tradeRelationshipCases) {
        if (otherMethod !== method) expect(mail[otherMethod]).not.toHaveBeenCalled();
      }
    });
  }
});
