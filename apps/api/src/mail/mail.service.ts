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

// Matches the Stocdup brand system used by the Keycloak login theme
// (apps/keycloak/themes/wholo/login/resources/css/login.css) — keep in sync
// if that palette changes.
const BRAND = {
  navy: '#1e2436',
  blue: '#1565FF',
  muted: '#9BA3AE',
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly inviteFrom: string;
  private readonly logoUrl: string;

  constructor(private config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', 'localhost');
    const port = config.get<number>('SMTP_PORT', 1025);
    const secure = config.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    this.from = config.get<string>('SMTP_FROM', 'noreply@wholo.com.au');
    // Decoupled from `from` so invite emails can ride a different, separately
    // verified sending address than order notifications (mirrors Keycloak's
    // own smtpFrom decoupling from api.smtp.from — see values.live.yaml).
    this.inviteFrom = config.get<string>('SMTP_INVITE_FROM', this.from);

    // Served from the admin app's public folder (apps/admin/public/logos),
    // same asset used in-app — not baked in, so it stays correct if the logo
    // is ever swapped without a mail service redeploy.
    const adminUrl = config.get<string>('ADMIN_URL', 'http://localhost:3020');
    this.logoUrl = `${adminUrl}/logos/stocdup-logo.png`;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });
  }

  // Shared header/footer chrome for every outbound email — keeps sender
  // identity consistent regardless of which flow triggered the send.
  private wrapHtml(bodyHtml: string): string {
    return `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: ${BRAND.navy};">
        <div style="text-align:center; margin-bottom: 36px;">
          <img src="${this.logoUrl}" alt="Stocdup" style="height: 26px; width: auto;" />
        </div>
        ${bodyHtml}
        <p style="margin-top: 36px; font-size: 13px; color: ${BRAND.muted}; text-align:center;">
          Kind regards,<br/>The Stocdup team
        </p>
      </div>
    `.trim();
  }

  private wrapText(bodyLines: string[]): string {
    return [...bodyLines, '', 'Kind regards,', 'The Stocdup team'].join('\n');
  }

  private button(url: string, label: string): string {
    return `
      <p style="text-align:center; margin: 28px 0;">
        <a href="${esc(url)}" style="display:inline-block;padding:13px 28px;background:${BRAND.blue};color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600;font-size:14px;">
          ${esc(label)}
        </a>
      </p>
    `;
  }

  async sendInvite(to: string, distributorName: string, inviteUrl: string): Promise<void> {
    const subject = `${headerSafe(distributorName)} invited you to Stocdup`;
    const text = this.wrapText([
      `Hi,`,
      ``,
      `${distributorName} would like you to access their store on Stocdup. ${distributorName} uses Stocdup to manage wholesale ordering.`,
      ``,
      `By accepting this invitation, you'll be able to browse their catalogue and place orders on Stocdup.`,
      ``,
      `Accept your invitation:`,
      `${inviteUrl}`,
      ``,
      `This invitation will expire in 7 days.`,
      ``,
      `If you weren't expecting this invitation, you can safely ignore it.`,
    ]);

    const html = this.wrapHtml(`
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Hi,</p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
        <strong>${esc(distributorName)}</strong> would like you to access their store on Stocdup.
        ${esc(distributorName)} uses Stocdup to manage wholesale ordering.
      </p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
        By accepting this invitation, you'll be able to browse their catalogue and place orders on Stocdup.
      </p>
      ${this.button(inviteUrl, 'Accept invitation')}
      <p style="font-size:13px; color:${BRAND.muted}; text-align:center; margin:0 0 8px;">This invitation will expire in 7 days.</p>
      <p style="font-size:12px; color:${BRAND.muted}; text-align:center; margin:0;">If you weren't expecting this invitation, you can safely ignore it.</p>
    `);

    try {
      await this.transporter.sendMail({ from: this.inviteFrom, to, subject, text, html });
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
    const text = this.wrapText([
      `Hi,`,
      ``,
      `${customerName} has placed order ${orderNumber}.`,
      ``,
      `Review the order:`,
      `${orderUrl}`,
    ]);

    const html = this.wrapHtml(`
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Hi,</p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
        <strong>${esc(customerName)}</strong> has placed order <strong>${esc(orderNumber)}</strong>.
      </p>
      ${this.button(orderUrl, 'Review order')}
    `);

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
    const text = this.wrapText([
      `Hi,`,
      ``,
      `Thanks — your order has been sent to ${distributorName}.`,
      ``,
      `Order number: ${orderNumber}`,
      ``,
      `You'll receive another notification when the order has been accepted.`,
    ]);

    const html = this.wrapHtml(`
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Hi,</p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
        Thanks — your order has been sent to <strong>${esc(distributorName)}</strong>.
      </p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Order number: <strong>${esc(orderNumber)}</strong></p>
      <p style="font-size:13px; color:${BRAND.muted}; text-align:center; margin:0;">You'll receive another notification when the order has been accepted.</p>
    `);

    await this.send(to, subject, text, html, 'order-received customer');
  }

  async sendOrderConfirmedToCustomer(
    to: string,
    params: { distributorName: string; orderNumber: string },
  ): Promise<void> {
    const { distributorName, orderNumber } = params;
    const subject = `Your order with ${headerSafe(distributorName)} has been confirmed`;
    const text = this.wrapText([
      `Hi,`,
      ``,
      `Good news — your order with ${distributorName} has been confirmed.`,
      ``,
      `Order number: ${orderNumber}`,
    ]);

    const html = this.wrapHtml(`
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Hi,</p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
        Good news — your order with <strong>${esc(distributorName)}</strong> has been confirmed.
      </p>
      <p style="font-size:15px; line-height:1.6; margin:0;">Order number: <strong>${esc(orderNumber)}</strong></p>
    `);

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
