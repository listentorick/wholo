import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  MailService,
  OrderDeliveredToDistributorParams,
  OrderDeliveryFailedEmailParams,
  OrderDeliveryFailedToDistributorParams,
  OrderStatusEmailParams,
  SendAccountingReconnectParams,
  SendInviteParams,
  SendOrderPlacedToDistributorParams,
  TradeRelationshipEmailParams,
} from './mail.service';

function orderStatusParams(overrides: Partial<OrderStatusEmailParams> = {}): OrderStatusEmailParams {
  return {
    distributorName: 'Vinos Direct',
    orderNumber: 'ORD-2026-00042',
    orderUrl: 'http://localhost:3010/vinos-direct/orders/order-1',
    distributorLogoUrl: null,
    distributorEmail: null,
    distributorPhone: null,
    ...overrides,
  };
}

function orderPlacedDistributorParams(
  overrides: Partial<SendOrderPlacedToDistributorParams> = {},
): SendOrderPlacedToDistributorParams {
  return {
    customerName: 'The Wine Bar',
    orderNumber: 'ORD-2026-00042',
    orderUrl: 'http://localhost:3020/orders/order-1',
    totalAmount: null,
    currency: null,
    requestedDeliveryDate: null,
    customerReference: null,
    lineItemCount: null,
    orderLines: null,
    ...overrides,
  };
}

function orderDeliveredDistributorParams(
  overrides: Partial<OrderDeliveredToDistributorParams> = {},
): OrderDeliveredToDistributorParams {
  return {
    distributorName: 'Vinos Direct',
    orderNumber: 'ORD-2026-00042',
    orderUrl: 'http://localhost:3020/orders/order-1',
    distributorLogoUrl: null,
    distributorEmail: null,
    distributorPhone: null,
    customerName: 'The Wine Bar',
    driverName: 'Alex Turner',
    ...overrides,
  };
}

function orderDeliveryFailedParams(overrides: Partial<OrderDeliveryFailedEmailParams> = {}): OrderDeliveryFailedEmailParams {
  return {
    distributorName: 'Vinos Direct',
    orderNumber: 'ORD-2026-00042',
    orderUrl: 'http://localhost:3010/vinos-direct/orders/order-1',
    distributorLogoUrl: null,
    distributorEmail: null,
    distributorPhone: null,
    unableReason: 'CUSTOMER_REFUSED',
    ...overrides,
  };
}

function orderDeliveryFailedDistributorParams(
  overrides: Partial<OrderDeliveryFailedToDistributorParams> = {},
): OrderDeliveryFailedToDistributorParams {
  return {
    distributorName: 'Vinos Direct',
    orderNumber: 'ORD-2026-00042',
    orderUrl: 'http://localhost:3020/orders/order-1',
    distributorLogoUrl: null,
    distributorEmail: null,
    distributorPhone: null,
    customerName: 'The Wine Bar',
    unableReason: 'CUSTOMER_REFUSED',
    ...overrides,
  };
}

function accountingReconnectParams(overrides: Partial<SendAccountingReconnectParams> = {}): SendAccountingReconnectParams {
  return {
    distributorName: 'Vinos Direct',
    provider: 'Xero',
    reconnectUrl: 'http://localhost:3020/integrations/accounting',
    reason: 'Xero refresh token is no longer valid (invalid_grant) — reconnecting Xero is required.',
    ...overrides,
  };
}

function tradeRelationshipParams(overrides: Partial<TradeRelationshipEmailParams> = {}): TradeRelationshipEmailParams {
  return {
    distributorName: 'Vinos Direct',
    distributorLogoUrl: null,
    distributorEmail: null,
    distributorPhone: null,
    portalUrl: 'http://localhost:3010/vinos-direct',
    ...overrides,
  };
}

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const FORBIDDEN_RECEIVED_WORDS = ['confirmed', 'accepted', 'approved', 'booked', 'guaranteed'];

describe('MailService — order emails', () => {
  let service: MailService;
  let sendMail: jest.Mock;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
      getOrThrow: jest.fn().mockReturnValue('http://localhost:3020'),
    } as unknown as ConfigService;

    service = new MailService(config);
  });

  describe('sendOrderPlacedToDistributor', () => {
    it('sends an email naming the customer, order number and order link', async () => {
      await service.sendOrderPlacedToDistributor('ops@dist.example', orderPlacedDistributorParams());

      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe('ops@dist.example');
      expect(mail.subject).toBe('New order from The Wine Bar');
      expect(mail.text).toContain('ORD-2026-00042');
      expect(mail.text).toContain('http://localhost:3020/orders/order-1');
      expect(mail.html).toContain('http://localhost:3020/orders/order-1');
    });

    it('includes order total, requested delivery date and PO reference when set', async () => {
      await service.sendOrderPlacedToDistributor(
        'ops@dist.example',
        orderPlacedDistributorParams({
          totalAmount: '842.50',
          currency: 'GBP',
          requestedDeliveryDate: '2026-08-19T00:00:00.000Z',
          customerReference: 'PO-9981',
        }),
      );

      const mail = sendMail.mock.calls[0][0];
      for (const body of [mail.text, mail.html]) {
        expect(body).toContain('GBP 842.50');
        expect(body).toContain('19 August 2026');
        expect(body).toContain('PO-9981');
      }
    });

    // The single most important fix in this template's history: it used to
    // show only a count ("Items: 14"), never what was actually ordered — a
    // distributor triaging a new order needs the product list, not a number.
    it('lists every product ordered, with SKU, quantity and line total, uncapped regardless of order size', async () => {
      const manyLines = Array.from({ length: 20 }, (_, i) => ({
        productName: `Product ${i + 1}`,
        sku: `SKU-${1000 + i}`,
        quantity: i + 1,
        lineTotal: `${(i + 1) * 10}.00`,
      }));

      await service.sendOrderPlacedToDistributor(
        'ops@dist.example',
        orderPlacedDistributorParams({ lineItemCount: 20, orderLines: manyLines }),
      );

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).toContain('Items (20)');
      // Not truncated: the 20th (last) item must be present, not just the first few.
      expect(mail.html).toContain('Product 20');
      expect(mail.html).toContain('SKU-1019');
      expect(mail.html).toContain('200.00');
      expect(mail.text).toContain('Product 20');
    });

    it('omits the items section entirely when no order lines are available (pre-this-change event replay)', async () => {
      await service.sendOrderPlacedToDistributor('ops@dist.example', orderPlacedDistributorParams({ orderLines: null }));

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).not.toContain('Items (');
    });

    it('omits total/items/delivery/PO reference lines gracefully when not set', async () => {
      await service.sendOrderPlacedToDistributor('ops@dist.example', orderPlacedDistributorParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).not.toContain('Order total');
      expect(mail.html).not.toContain('Requested delivery');
      expect(mail.html).not.toContain('PO reference');
    });
  });

  describe('sendOrderReceivedToCustomer', () => {
    it('sends a received email identifying the distributor and order number', async () => {
      await service.sendOrderReceivedToCustomer('buyer@customer.example', orderStatusParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe('buyer@customer.example');
      expect(mail.subject).toBe('Your order with Vinos Direct has been received');
      expect(mail.text).toContain('Vinos Direct');
      expect(mail.text).toContain('ORD-2026-00042');
    });

    it('never implies the order has been accepted', async () => {
      await service.sendOrderReceivedToCustomer('buyer@customer.example', orderStatusParams());

      const mail = sendMail.mock.calls[0][0];
      // "when the order has been accepted" (future tense) is allowed; what must
      // not appear is any present/past claim, so check subject and the claim line.
      expect(mail.subject.toLowerCase()).not.toMatch(
        new RegExp(FORBIDDEN_RECEIVED_WORDS.join('|')),
      );
      const claimLines = [
        ...String(mail.text).split('\n'),
        ...String(mail.html).split('\n'),
      ].filter((line) => !/you'll get another email/i.test(line));
      for (const word of FORBIDDEN_RECEIVED_WORDS) {
        for (const line of claimLines) {
          expect(line.toLowerCase()).not.toContain(word);
        }
      }
    });

    it('includes a "View order" link to the portal when orderUrl is set', async () => {
      await service.sendOrderReceivedToCustomer('buyer@customer.example', orderStatusParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).toContain('http://localhost:3010/vinos-direct/orders/order-1');
      expect(mail.text).toContain('http://localhost:3010/vinos-direct/orders/order-1');
    });

    it('omits the "View order" button when the distributor has no portal slug', async () => {
      await service.sendOrderReceivedToCustomer('buyer@customer.example', orderStatusParams({ orderUrl: null }));

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).not.toContain('View order');
    });

    it('shows the distributor logo when provided, and omits it gracefully when not', async () => {
      const withLogo = await (async () => {
        await service.sendOrderReceivedToCustomer(
          'buyer@customer.example',
          orderStatusParams({ distributorLogoUrl: 'https://cdn.stocdup.com/logo.png' }),
        );
        return sendMail.mock.calls[sendMail.mock.calls.length - 1][0];
      })();
      expect(withLogo.html).toContain('https://cdn.stocdup.com/logo.png');

      await service.sendOrderReceivedToCustomer('buyer@customer.example', orderStatusParams({ distributorLogoUrl: null }));
      const withoutLogo = sendMail.mock.calls[sendMail.mock.calls.length - 1][0];
      expect(withoutLogo.html.match(/<img\b/g)).toHaveLength(1); // only the Stocdup mark
    });

    it('includes a distributor contact line built from whichever of email/phone are set', async () => {
      await service.sendOrderReceivedToCustomer(
        'buyer@customer.example',
        orderStatusParams({ distributorEmail: 'orders@vinos.example', distributorPhone: null }),
      );

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).toContain('orders@vinos.example');
      expect(mail.text).toContain('orders@vinos.example');
    });
  });

  describe('sendOrderConfirmedToCustomer', () => {
    it('sends a confirmed email identifying the distributor and order number', async () => {
      await service.sendOrderConfirmedToCustomer('buyer@customer.example', orderStatusParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Your order with Vinos Direct has been confirmed');
      expect(mail.text).toContain('ORD-2026-00042');
    });

    it('includes a "View order" link to the portal when orderUrl is set', async () => {
      await service.sendOrderConfirmedToCustomer('buyer@customer.example', orderStatusParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).toContain('http://localhost:3010/vinos-direct/orders/order-1');
    });

    it('omits the "View order" button when the distributor has no portal slug', async () => {
      await service.sendOrderConfirmedToCustomer('buyer@customer.example', orderStatusParams({ orderUrl: null }));

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).not.toContain('View order');
    });
  });

  describe('sendOrderDeliveredToCustomer', () => {
    it('sends a delivered email identifying the distributor and order number', async () => {
      await service.sendOrderDeliveredToCustomer('buyer@customer.example', orderStatusParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Your order with Vinos Direct has been delivered');
      expect(mail.text).toContain('ORD-2026-00042');
      expect(mail.html).toContain('http://localhost:3010/vinos-direct/orders/order-1');
    });
  });

  describe('sendOrderDeliveredToDistributor', () => {
    it('names the customer, order number, order link and driver', async () => {
      await service.sendOrderDeliveredToDistributor('ops@dist.example', orderDeliveredDistributorParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Order ORD-2026-00042 delivered');
      expect(mail.text).toContain('The Wine Bar');
      expect(mail.text).toContain('Alex Turner');
      expect(mail.html).toContain('http://localhost:3020/orders/order-1');
    });

    it('omits the driver line when no driver is known', async () => {
      await service.sendOrderDeliveredToDistributor('ops@dist.example', orderDeliveredDistributorParams({ driverName: null }));

      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).not.toContain('Driver:');
    });
  });

  describe('sendOrderDeliveryFailedToCustomer', () => {
    it('sends a plain-language, non-blaming reason to the customer', async () => {
      await service.sendOrderDeliveryFailedToCustomer('buyer@customer.example', orderDeliveryFailedParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe("We couldn't deliver your order from Vinos Direct");
      expect(mail.html).toContain('declined at the door');
      expect(mail.html).not.toContain('CUSTOMER_REFUSED');
    });

    it('omits the reason line when none is provided', async () => {
      await service.sendOrderDeliveryFailedToCustomer('buyer@customer.example', orderDeliveryFailedParams({ unableReason: null }));

      const mail = sendMail.mock.calls[0][0];
      expect(mail.text).not.toContain('null');
    });
  });

  describe('sendOrderDeliveryFailedToDistributor', () => {
    it('sends the operational reason label to the distributor', async () => {
      await service.sendOrderDeliveryFailedToDistributor('ops@dist.example', orderDeliveryFailedDistributorParams());

      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Order ORD-2026-00042 could not be delivered');
      expect(mail.html).toContain('the customer refused delivery');
    });
  });

  it('escapes HTML in user-controlled names and strips newlines from subjects', async () => {
    await service.sendOrderPlacedToDistributor(
      'ops@dist.example',
      orderPlacedDistributorParams({ customerName: '<img src=x onerror=alert(1)>\r\nBcc: evil@x' }),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(mail.html).toContain('&lt;img');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('rethrows transport failures so callers can record them', async () => {
    sendMail.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(
      service.sendOrderReceivedToCustomer('buyer@customer.example', orderStatusParams()),
    ).rejects.toThrow('SMTP connection refused');
  });

  it('brands every email with the Stocdup icon lockup, not Wholo', async () => {
    await service.sendOrderPlacedToDistributor('ops@dist.example', orderPlacedDistributorParams());

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('/logos/stocdup-logo-only.png');
    expect(mail.html).toMatch(/color:#0B1D3A;">stocd<\/span><span style="color:#1565FF;">up/);
    expect(mail.html).not.toContain('Wholo');
    expect(mail.text).not.toContain('Wholo');
  });
});

describe('MailService — trade-relationship emails', () => {
  let service: MailService;
  let sendMail: jest.Mock;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
      getOrThrow: jest.fn().mockReturnValue('http://localhost:3020'),
    } as unknown as ConfigService;

    service = new MailService(config);
  });

  it('sendTradeRelationshipRequestAccepted includes a catalogue link when a portal URL is given', async () => {
    await service.sendTradeRelationshipRequestAccepted('buyer@winebar.example', tradeRelationshipParams());

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Vinos Direct accepted your connection request');
    expect(mail.html).toContain('http://localhost:3010/vinos-direct');
    expect(mail.text).toContain('http://localhost:3010/vinos-direct');
  });

  it('sendTradeRelationshipRequestDeclined omits a link and does not blame the customer', async () => {
    await service.sendTradeRelationshipRequestDeclined('buyer@winebar.example', tradeRelationshipParams({ portalUrl: null }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Your request to connect with Vinos Direct');
    expect(mail.text).toContain('welcome to send another request');
  });

  it('sendTradeRelationshipSuspended never includes a portal link, even if one were passed', async () => {
    await service.sendTradeRelationshipSuspended('buyer@winebar.example', tradeRelationshipParams());

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Your account with Vinos Direct has been suspended');
    // The mail method itself doesn't render a button for this event regardless
    // of payload — the "no browsing while suspended" rule is enforced at the
    // point the payload is built (admin-customers.service.ts), this just checks
    // the template doesn't independently add one back.
    expect(mail.html).not.toContain('View catalogue');
  });

  it('sendTradeRelationshipUnsuspended includes a catalogue link when a portal URL is given', async () => {
    await service.sendTradeRelationshipUnsuspended('buyer@winebar.example', tradeRelationshipParams());

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Vinos Direct reactivated your account');
    expect(mail.html).toContain('http://localhost:3010/vinos-direct');
  });

  it('sendTradeRelationshipActivated includes a catalogue link when a portal URL is given', async () => {
    await service.sendTradeRelationshipActivated('buyer@winebar.example', tradeRelationshipParams());

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Vinos Direct activated your account');
    expect(mail.html).toContain('http://localhost:3010/vinos-direct');
    // Copy must not claim the customer requested anything — this trigger
    // bypasses invite/request flows entirely (distributor vouching directly).
    expect(mail.html.toLowerCase()).not.toContain('accepted your request');
  });

  it('omits the catalogue button across all three link-eligible emails when portalUrl is null', async () => {
    await service.sendTradeRelationshipRequestAccepted('a@b.example', tradeRelationshipParams({ portalUrl: null }));
    await service.sendTradeRelationshipUnsuspended('a@b.example', tradeRelationshipParams({ portalUrl: null }));
    await service.sendTradeRelationshipActivated('a@b.example', tradeRelationshipParams({ portalUrl: null }));

    for (const call of sendMail.mock.calls) {
      expect(call[0].html).not.toContain('View catalogue');
    }
  });

  it('shows the distributor logo when provided, and omits it gracefully when not', async () => {
    await service.sendTradeRelationshipSuspended(
      'buyer@winebar.example',
      tradeRelationshipParams({ distributorLogoUrl: 'https://cdn.stocdup.com/logo.png' }),
    );
    const withLogo = sendMail.mock.calls[sendMail.mock.calls.length - 1][0];
    expect(withLogo.html).toContain('https://cdn.stocdup.com/logo.png');

    await service.sendTradeRelationshipSuspended('buyer@winebar.example', tradeRelationshipParams({ distributorLogoUrl: null }));
    const withoutLogo = sendMail.mock.calls[sendMail.mock.calls.length - 1][0];
    expect(withoutLogo.html.match(/<img\b/g)).toHaveLength(1); // only the Stocdup mark
  });

  it('includes a distributor contact line built from whichever of email/phone are set, across all five emails', async () => {
    const withContact = tradeRelationshipParams({ distributorEmail: 'orders@vinos.example', distributorPhone: null });

    await service.sendTradeRelationshipRequestAccepted('buyer@winebar.example', withContact);
    await service.sendTradeRelationshipRequestDeclined('buyer@winebar.example', withContact);
    await service.sendTradeRelationshipSuspended('buyer@winebar.example', withContact);
    await service.sendTradeRelationshipUnsuspended('buyer@winebar.example', withContact);
    await service.sendTradeRelationshipActivated('buyer@winebar.example', withContact);

    for (const call of sendMail.mock.calls) {
      expect(call[0].html).toContain('orders@vinos.example');
      expect(call[0].text).toContain('orders@vinos.example');
    }
  });
});

describe('MailService — accounting connection emails', () => {
  let service: MailService;
  let sendMail: jest.Mock;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
      getOrThrow: jest.fn().mockReturnValue('http://localhost:3020'),
    } as unknown as ConfigService;

    service = new MailService(config);
  });

  it('sendAccountingConnectionNeedsReconnect names the distributor, provider and links to the reconnect page', async () => {
    await service.sendAccountingConnectionNeedsReconnect('admin@dist.example', accountingReconnectParams());

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('admin@dist.example');
    expect(mail.subject).toBe('Xero needs to be reconnected');
    expect(mail.text).toContain('Vinos Direct');
    expect(mail.text).toContain('http://localhost:3020/integrations/accounting');
    expect(mail.html).toContain('http://localhost:3020/integrations/accounting');
  });

  it('includes the specific reason the connection failed, not just that it did', async () => {
    await service.sendAccountingConnectionNeedsReconnect(
      'admin@dist.example',
      accountingReconnectParams({ reason: 'Xero refresh token is no longer valid (invalid_grant) — reconnecting Xero is required.' }),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Xero refresh token is no longer valid (invalid_grant)');
    expect(mail.text).toContain('Xero refresh token is no longer valid (invalid_grant)');
  });
});

describe('MailService — invite from-address', () => {
  let sendMail: jest.Mock;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('sends invites from SMTP_INVITE_FROM when set, decoupled from SMTP_FROM', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'SMTP_FROM') return 'notifications@stocdup.com';
        if (key === 'SMTP_INVITE_FROM') return 'noreply@stocdup.com';
        return defaultValue;
      }),
      getOrThrow: jest.fn().mockReturnValue('http://localhost:3020'),
    } as unknown as ConfigService;

    const service = new MailService(config);
    await service.sendInvite('buyer@winebar.example', inviteParams());

    expect(sendMail.mock.calls[0][0].from).toBe('noreply@stocdup.com');
  });

  it('falls back to SMTP_FROM for invites when SMTP_INVITE_FROM is unset', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'SMTP_FROM') return 'noreply@wholo.com.au';
        return defaultValue;
      }),
      getOrThrow: jest.fn().mockReturnValue('http://localhost:3020'),
    } as unknown as ConfigService;

    const service = new MailService(config);
    await service.sendInvite('buyer@winebar.example', inviteParams());

    expect(sendMail.mock.calls[0][0].from).toBe('noreply@wholo.com.au');
  });
});

function inviteParams(overrides: Partial<SendInviteParams> = {}): SendInviteParams {
  return {
    distributorName: 'Vinos Direct',
    customerName: 'The Wine Bar',
    inviteUrl: 'http://localhost:3010/accept-invite?token=abc',
    recipientEmail: 'buyer@winebar.example',
    expiresAt: new Date('2026-08-19T00:00:00Z'),
    distributorLogoUrl: null,
    distributorEmail: null,
    distributorPhone: null,
    ...overrides,
  };
}

describe('MailService — invite email', () => {
  let service: MailService;
  let sendMail: jest.Mock;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
      getOrThrow: jest.fn().mockReturnValue('http://localhost:3020'),
    } as unknown as ConfigService;

    service = new MailService(config);
  });

  it('sends a subject naming the distributor and a body naming the customer, invite link, recipient and expiry', async () => {
    await service.sendInvite('buyer@winebar.example', inviteParams());

    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('buyer@winebar.example');
    expect(mail.subject).toBe('Vinos Direct invited you to Stocdup');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('Vinos Direct');
      expect(body).toContain('The Wine Bar');
      expect(body).toContain('http://localhost:3010/accept-invite?token=abc');
      expect(body).toContain('buyer@winebar.example');
      expect(body).toContain('19 August 2026');
    }
  });

  it('always shows the icon-only Stocdup mark paired with live text, matching the admin app chrome, never a wordmark image', async () => {
    await service.sendInvite('buyer@winebar.example', inviteParams({ distributorLogoUrl: null }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('/logos/stocdup-logo-only.png');
    expect(mail.html).not.toContain('/logos/stocdup-logo.png"');
    expect(mail.html).toMatch(/color:#0B1D3A;">stocd<\/span><span style="color:#1565FF;">up/);
  });

  it('omits the distributor logo image entirely when none is uploaded (only the Stocdup logo remains)', async () => {
    await service.sendInvite('buyer@winebar.example', inviteParams({ distributorLogoUrl: null }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html.match(/<img\b/g)).toHaveLength(1);
  });

  it('renders the distributor logo as a circular image, floated so the headline text wraps around it, when one is uploaded', async () => {
    await service.sendInvite(
      'buyer@winebar.example',
      inviteParams({ distributorLogoUrl: 'https://cdn.stocdup.com/logo.png' }),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toMatch(
      /<img src="https:\/\/cdn\.stocdup\.com\/logo\.png"[^>]*float:left[^>]*border-radius:31px/,
    );
  });

  it('always names the distributor in the headline, with or without a logo', async () => {
    await service.sendInvite('buyer@winebar.example', inviteParams({ distributorLogoUrl: null }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Vinos Direct');
    expect(mail.html).not.toContain('float:left'); // no logo => headline runs full-width, nothing to float
  });

  it('omits the distributor contact line when neither email nor phone is available', async () => {
    await service.sendInvite(
      'buyer@winebar.example',
      inviteParams({ distributorEmail: null, distributorPhone: null }),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).not.toContain('Questions about your account');
    expect(mail.html).not.toContain('Questions about your account');
  });

  it('includes a distributor contact line built from whichever of email/phone are set', async () => {
    await service.sendInvite(
      'buyer@winebar.example',
      inviteParams({ distributorEmail: 'orders@vinos.example', distributorPhone: '(03) 9123 4567' }),
    );

    const mail = sendMail.mock.calls[0][0];
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('orders@vinos.example');
      expect(body).toContain('(03) 9123 4567');
    }
  });

  it('always shows the Stocdup support contact', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key === 'SMTP_SUPPORT_EMAIL' ? 'help@stocdup.com' : defaultValue,
      ),
      getOrThrow: jest.fn().mockReturnValue('http://localhost:3020'),
    } as unknown as ConfigService;
    const supportService = new MailService(config);

    await supportService.sendInvite('buyer@winebar.example', inviteParams());

    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).toContain('help@stocdup.com');
    expect(mail.html).toContain('help@stocdup.com');
  });

  it('escapes HTML in the distributor and customer names', async () => {
    await service.sendInvite(
      'buyer@winebar.example',
      inviteParams({ distributorName: '<img src=x onerror=alert(1)>', customerName: '<b>evil</b>' }),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(mail.html).not.toContain('<b>evil</b>');
    expect(mail.html).toContain('&lt;img');
  });

  it('rethrows transport failures so callers can record them', async () => {
    sendMail.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(service.sendInvite('buyer@winebar.example', inviteParams())).rejects.toThrow(
      'SMTP connection refused',
    );
  });
});
