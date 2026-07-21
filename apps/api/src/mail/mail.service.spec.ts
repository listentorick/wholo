import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

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
    } as unknown as ConfigService;

    service = new MailService(config);
  });

  describe('sendOrderPlacedToDistributor', () => {
    it('sends an email naming the customer, order number and order link', async () => {
      await service.sendOrderPlacedToDistributor('ops@dist.example', {
        customerName: 'The Wine Bar',
        orderNumber: 'ORD-2026-00042',
        orderUrl: 'http://localhost:3020/orders/order-1',
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe('ops@dist.example');
      expect(mail.subject).toBe('New order from The Wine Bar');
      expect(mail.text).toContain('ORD-2026-00042');
      expect(mail.text).toContain('http://localhost:3020/orders/order-1');
      expect(mail.html).toContain('http://localhost:3020/orders/order-1');
    });
  });

  describe('sendOrderReceivedToCustomer', () => {
    it('sends a received email identifying the distributor and order number', async () => {
      await service.sendOrderReceivedToCustomer('buyer@customer.example', {
        distributorName: 'Vinos Direct',
        orderNumber: 'ORD-2026-00042',
      });

      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe('buyer@customer.example');
      expect(mail.subject).toBe('Your order with Vinos Direct has been received');
      expect(mail.text).toContain('Vinos Direct');
      expect(mail.text).toContain('ORD-2026-00042');
    });

    it('never implies the order has been accepted', async () => {
      await service.sendOrderReceivedToCustomer('buyer@customer.example', {
        distributorName: 'Vinos Direct',
        orderNumber: 'ORD-2026-00042',
      });

      const mail = sendMail.mock.calls[0][0];
      // "when the order has been accepted" (future tense) is allowed; what must
      // not appear is any present/past claim, so check subject and the claim line.
      expect(mail.subject.toLowerCase()).not.toMatch(
        new RegExp(FORBIDDEN_RECEIVED_WORDS.join('|')),
      );
      const claimLines = [
        ...String(mail.text).split('\n'),
        ...String(mail.html).split('\n'),
      ].filter((line) => !/you'll receive another notification/i.test(line));
      for (const word of FORBIDDEN_RECEIVED_WORDS) {
        for (const line of claimLines) {
          expect(line.toLowerCase()).not.toContain(word);
        }
      }
    });
  });

  describe('sendOrderConfirmedToCustomer', () => {
    it('sends a confirmed email identifying the distributor and order number', async () => {
      await service.sendOrderConfirmedToCustomer('buyer@customer.example', {
        distributorName: 'Vinos Direct',
        orderNumber: 'ORD-2026-00042',
      });

      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Your order with Vinos Direct has been confirmed');
      expect(mail.text).toContain('ORD-2026-00042');
    });
  });

  it('escapes HTML in user-controlled names and strips newlines from subjects', async () => {
    await service.sendOrderPlacedToDistributor('ops@dist.example', {
      customerName: '<img src=x onerror=alert(1)>\r\nBcc: evil@x',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3020/orders/order-1',
    });

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(mail.html).toContain('&lt;img');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('rethrows transport failures so callers can record them', async () => {
    sendMail.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(
      service.sendOrderReceivedToCustomer('buyer@customer.example', {
        distributorName: 'Vinos Direct',
        orderNumber: 'ORD-2026-00042',
      }),
    ).rejects.toThrow('SMTP connection refused');
  });

  it('brands every email with the Stocdup logo and sign-off, not Wholo', async () => {
    await service.sendOrderPlacedToDistributor('ops@dist.example', {
      customerName: 'The Wine Bar',
      orderNumber: 'ORD-2026-00042',
      orderUrl: 'http://localhost:3020/orders/order-1',
    });

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('/logos/stocdup-logo.png');
    expect(mail.html).toContain('The Stocdup team');
    expect(mail.text).toContain('The Stocdup team');
    expect(mail.html).not.toContain('Wholo');
    expect(mail.text).not.toContain('Wholo');
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
    } as unknown as ConfigService;

    const service = new MailService(config);
    await service.sendInvite('buyer@winebar.example', 'Vinos Direct', 'http://localhost:3010/accept-invite?token=abc');

    expect(sendMail.mock.calls[0][0].from).toBe('noreply@stocdup.com');
  });

  it('falls back to SMTP_FROM for invites when SMTP_INVITE_FROM is unset', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'SMTP_FROM') return 'noreply@wholo.com.au';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const service = new MailService(config);
    await service.sendInvite('buyer@winebar.example', 'Vinos Direct', 'http://localhost:3010/accept-invite?token=abc');

    expect(sendMail.mock.calls[0][0].from).toBe('noreply@wholo.com.au');
  });
});
