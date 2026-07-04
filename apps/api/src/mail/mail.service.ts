import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Organisation names are set by users — escape anything interpolated into
// HTML bodies, and keep header values free of CR/LF.
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', 'localhost');
    const port = config.get<number>('SMTP_PORT', 1025);
    const secure = config.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    this.from = config.get<string>('SMTP_FROM', 'noreply@wholo.com.au');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });
  }

  async sendInvite(to: string, distributorName: string, inviteUrl: string): Promise<void> {
    const subject = `${headerSafe(distributorName)} has invited you to connect on Wholo`;
    const text = [
      `Hi,`,
      ``,
      `${distributorName} has invited you to connect with them on Wholo.`,
      ``,
      `Click the link below to accept and set up your account:`,
      `${inviteUrl}`,
      ``,
      `This link expires in 7 days.`,
      ``,
      `If you weren't expecting this invitation, you can safely ignore it.`,
    ].join('\n');

    const html = `
      <p>Hi,</p>
      <p><strong>${esc(distributorName)}</strong> has invited you to connect with them on Wholo.</p>
      <p>
        <a href="${esc(inviteUrl)}" style="display:inline-block;padding:12px 24px;background:#D97036;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="color:#888;font-size:12px;">This link expires in 7 days. If you weren't expecting this, you can safely ignore it.</p>
    `.trim();

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`Invite email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send invite email to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendOrderPlacedToDistributor(
    to: string,
    params: { customerName: string; orderNumber: string; orderUrl: string },
  ): Promise<void> {
    const { customerName, orderNumber, orderUrl } = params;
    const subject = `New order from ${headerSafe(customerName)}`;
    const text = [
      `Hi,`,
      ``,
      `${customerName} has placed order ${orderNumber}.`,
      ``,
      `Review the order in Wholo:`,
      `${orderUrl}`,
    ].join('\n');

    const html = `
      <p>Hi,</p>
      <p><strong>${esc(customerName)}</strong> has placed order <strong>${esc(orderNumber)}</strong>.</p>
      <p>
        <a href="${esc(orderUrl)}" style="display:inline-block;padding:12px 24px;background:#D97036;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
          Review order
        </a>
      </p>
    `.trim();

    await this.send(to, subject, text, html, 'order-placed distributor');
  }

  // Wording must not imply acceptance: the order is submitted, not yet
  // accepted/confirmed/approved, unless the distributor auto-accepts (see
  // sendOrderConfirmedToCustomer).
  async sendOrderReceivedToCustomer(
    to: string,
    params: { distributorName: string; orderNumber: string },
  ): Promise<void> {
    const { distributorName, orderNumber } = params;
    const subject = `Your order with ${headerSafe(distributorName)} has been received`;
    const text = [
      `Hi,`,
      ``,
      `Thanks — your order has been sent to ${distributorName}.`,
      ``,
      `Order number: ${orderNumber}`,
      ``,
      `You'll receive another notification when the order has been accepted.`,
    ].join('\n');

    const html = `
      <p>Hi,</p>
      <p>Thanks — your order has been sent to <strong>${esc(distributorName)}</strong>.</p>
      <p>Order number: <strong>${esc(orderNumber)}</strong></p>
      <p style="color:#888;font-size:12px;">You'll receive another notification when the order has been accepted.</p>
    `.trim();

    await this.send(to, subject, text, html, 'order-received customer');
  }

  async sendOrderConfirmedToCustomer(
    to: string,
    params: { distributorName: string; orderNumber: string },
  ): Promise<void> {
    const { distributorName, orderNumber } = params;
    const subject = `Your order with ${headerSafe(distributorName)} has been confirmed`;
    const text = [
      `Hi,`,
      ``,
      `Good news — your order with ${distributorName} has been confirmed.`,
      ``,
      `Order number: ${orderNumber}`,
    ].join('\n');

    const html = `
      <p>Hi,</p>
      <p>Good news — your order with <strong>${esc(distributorName)}</strong> has been confirmed.</p>
      <p>Order number: <strong>${esc(orderNumber)}</strong></p>
    `.trim();

    await this.send(to, subject, text, html, 'order-confirmed customer');
  }

  private async send(to: string, subject: string, text: string, html: string, kind: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`${kind} email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send ${kind} email to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }
}
