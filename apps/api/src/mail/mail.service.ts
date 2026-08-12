import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { compileMjmlTemplate } from './mail-template';

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

export interface SendInviteParams {
  distributorName: string;
  customerName: string;
  inviteUrl: string;
  recipientEmail: string;
  expiresAt: Date;
  distributorLogoUrl: string | null;
  distributorEmail: string | null;
  distributorPhone: string | null;
}

// Shared by sendOrderReceivedToCustomer/sendOrderConfirmedToCustomer.
// orderUrl is null when the distributor has no slug set — the template
// omits the "View order" CTA gracefully rather than linking somewhere broken.
export interface OrderStatusEmailParams {
  distributorName: string;
  orderNumber: string;
  orderUrl: string | null;
  distributorLogoUrl: string | null;
  distributorEmail: string | null;
  distributorPhone: string | null;
}

// Shared by all five trade-relationship status-transition emails. portalUrl
// is null for Suspended (nothing to browse while suspended) and Declined
// (the relationship isn't active) — each template decides whether to render
// a CTA at all, not just whether the link is present.
export interface TradeRelationshipEmailParams {
  distributorName: string;
  distributorLogoUrl: string | null;
  distributorEmail: string | null;
  distributorPhone: string | null;
  portalUrl: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly inviteFrom: string;
  private readonly supportEmail: string;
  private readonly logoUrl: string;
  private readonly logoOnlyUrl: string;

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
    // Shown in the invite email's "need help using Stocdup?" line — a
    // platform-level contact, distinct from the distributor's own contact.
    this.supportEmail = config.get<string>('SMTP_SUPPORT_EMAIL', 'support@stocdup.com');

    // Served from the admin app's public folder (apps/admin/public/logos),
    // same asset used in-app — not baked in, so it stays correct if the logo
    // is ever swapped without a mail service redeploy.
    const adminUrl = config.get<string>('ADMIN_URL', 'http://localhost:3020');
    this.logoUrl = `${adminUrl}/logos/stocdup-logo.png`;
    // Icon-only mark, paired with real live text (not baked into the image)
    // in the invite email's header — mirrors the admin app's own sidebar
    // chrome lockup (apps/admin/src/components/Sidebar.tsx), not a new
    // pattern invented for email.
    this.logoOnlyUrl = `${adminUrl}/logos/stocdup-logo-only.png`;

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

  // The one email built from a real MJML template (apps/api/src/mail/templates/invite.mjml)
  // matching the portal's own design system, rather than the wrapHtml/wrapText
  // chrome used by every other email below — see ADR/plan discussion on why
  // invite gets the richer treatment. distributorLogoUrl/distributorEmail/
  // distributorPhone are optional and degrade gracefully when absent (no
  // broken image, no empty "contact" line) — see the template's {{#if}} blocks.
  async sendInvite(to: string, params: SendInviteParams): Promise<void> {
    const {
      distributorName, customerName, inviteUrl, recipientEmail, expiresAt,
      distributorLogoUrl, distributorEmail, distributorPhone,
    } = params;

    const subject = `${headerSafe(distributorName)} invited you to Stocdup`;
    const expiresAtFormatted = expiresAt.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `${distributorName} has invited you to access its online catalogue and place orders through Stocdup.`,
      ``,
      `Your account will be connected to ${customerName}, giving you access to the products, prices and delivery options available to your business.`,
      ``,
      `Through Stocdup, you can:`,
      `- Browse ${distributorName}'s catalogue`,
      `- See your agreed products and prices`,
      `- Choose an available delivery date`,
      `- Place and review orders online`,
      ``,
      `Accept your invitation:`,
      inviteUrl,
      ``,
      `This invitation was sent to ${recipientEmail} and will expire on ${expiresAtFormatted}.`,
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('invite', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      customerName: esc(customerName),
      inviteUrl: esc(inviteUrl),
      recipientEmail: esc(recipientEmail),
      expiresAtFormatted: esc(expiresAtFormatted),
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

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
  // sendOrderConfirmedToCustomer). Built from a real MJML template matching
  // the portal's design system — see apps/api/src/mail/templates/order-received.mjml
  // and the invite.mjml precedent this whole redesigned set follows.
  async sendOrderReceivedToCustomer(
    to: string,
    params: OrderStatusEmailParams,
  ): Promise<void> {
    const { distributorName, orderNumber, orderUrl, distributorLogoUrl, distributorEmail, distributorPhone } = params;
    const subject = `Your order with ${headerSafe(distributorName)} has been received`;
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `Thanks — your order has been sent to ${distributorName}.`,
      ``,
      `Order number: ${orderNumber}`,
      ``,
      `You'll get another email as soon as ${distributorName} accepts it.`,
      ...(orderUrl ? ['', `View your order:`, orderUrl] : []),
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('order-received', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      orderNumber: esc(orderNumber),
      orderUrl: orderUrl ? esc(orderUrl) : '',
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      identityText: `Thanks — your order has been sent to <strong>${esc(distributorName)}</strong>.`,
      identityRowGap: '8',
      identityBorderColor: '#E6ECF2',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'order-received customer');
  }

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/order-confirmed.mjml.
  async sendOrderConfirmedToCustomer(
    to: string,
    params: OrderStatusEmailParams,
  ): Promise<void> {
    const { distributorName, orderNumber, orderUrl, distributorLogoUrl, distributorEmail, distributorPhone } = params;
    const subject = `Your order with ${headerSafe(distributorName)} has been confirmed`;
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `Good news — ${distributorName} has confirmed your order.`,
      ``,
      `Order number: ${orderNumber}`,
      ...(orderUrl ? ['', `View your order:`, orderUrl] : []),
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('order-confirmed', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      orderNumber: esc(orderNumber),
      orderUrl: orderUrl ? esc(orderUrl) : '',
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      identityText: `Good news — <strong>${esc(distributorName)}</strong> has confirmed your order.`,
      identityRowGap: '8',
      identityBorderColor: '#E6ECF2',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'order-confirmed customer');
  }

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/trade-relationship-request-accepted.mjml.
  async sendTradeRelationshipRequestAccepted(
    to: string,
    params: TradeRelationshipEmailParams,
  ): Promise<void> {
    const { distributorName, distributorLogoUrl, distributorEmail, distributorPhone, portalUrl } = params;
    const subject = `${headerSafe(distributorName)} accepted your connection request`;
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `${distributorName} has accepted your request to connect. You can now browse their catalogue and place orders through Stocdup.`,
      ...(portalUrl ? ['', `Browse their catalogue:`, portalUrl] : []),
      ``,
      `Through Stocdup, you can:`,
      `- Browse ${distributorName}'s catalogue`,
      `- See your agreed products and prices`,
      `- Choose an available delivery date`,
      `- Place and review orders online`,
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('trade-relationship-request-accepted', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      portalUrl: portalUrl ? esc(portalUrl) : '',
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      identityText: `<strong>${esc(distributorName)}</strong> has accepted your request to connect. You can now browse their catalogue and place orders through Stocdup.`,
      identityRowGap: '24',
      identityBorderColor: '#E6ECF2',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'trade-relationship request-accepted');
  }

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/trade-relationship-request-declined.mjml.
  // No CTA: the relationship isn't active, there's nothing to click through to.
  async sendTradeRelationshipRequestDeclined(
    to: string,
    params: TradeRelationshipEmailParams,
  ): Promise<void> {
    const { distributorName, distributorLogoUrl, distributorEmail, distributorPhone } = params;
    const subject = `Your request to connect with ${headerSafe(distributorName)}`;
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `${distributorName} has declined your request to connect. You're welcome to send another request in future.`,
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('trade-relationship-request-declined', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      identityText: `<strong>${esc(distributorName)}</strong> has declined your request to connect.`,
      identityRowGap: '8',
      identityBorderColor: '#E6ECF2',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'trade-relationship request-declined');
  }

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/trade-relationship-suspended.mjml.
  // Deliberately neutral (Light Blue Grey), not error-red — see that file's
  // direction contract for why. No CTA — nothing to click while suspended.
  async sendTradeRelationshipSuspended(
    to: string,
    params: TradeRelationshipEmailParams,
  ): Promise<void> {
    const { distributorName, distributorLogoUrl, distributorEmail, distributorPhone } = params;
    const subject = `Your account with ${headerSafe(distributorName)} has been suspended`;
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `${distributorName} has suspended your account. You won't be able to place orders with them until they lift the suspension.`,
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('trade-relationship-suspended', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      identityText: `<strong>${esc(distributorName)}</strong> has suspended your account.`,
      identityRowGap: '8',
      // White, not the usual E6ECF2 — this band's own fill IS E6ECF2, so the
      // default border would be invisible against it (see _identity-row.mjml).
      identityBorderColor: '#FFFFFF',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'trade-relationship suspended');
  }

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/trade-relationship-unsuspended.mjml.
  // No benefits checklist (unlike request-accepted/activated) — this
  // customer already knows the platform, they just got access back.
  async sendTradeRelationshipUnsuspended(
    to: string,
    params: TradeRelationshipEmailParams,
  ): Promise<void> {
    const { distributorName, distributorLogoUrl, distributorEmail, distributorPhone, portalUrl } = params;
    const subject = `${headerSafe(distributorName)} reactivated your account`;
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `Good news — ${distributorName} has reactivated your account. You can order with them again.`,
      ...(portalUrl ? ['', `Browse their catalogue:`, portalUrl] : []),
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('trade-relationship-unsuspended', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      portalUrl: portalUrl ? esc(portalUrl) : '',
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      identityText: `Good news — <strong>${esc(distributorName)}</strong> has reactivated your account. You can order with them again.`,
      identityRowGap: '24',
      identityBorderColor: '#E6ECF2',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'trade-relationship unsuspended');
  }

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/trade-relationship-activated.mjml. Copy
  // must not say "accepted your request" — this trigger bypasses invite/
  // request flows entirely (the distributor vouching for the customer
  // directly, see admin-customers.service.ts activate()).
  async sendTradeRelationshipActivated(
    to: string,
    params: TradeRelationshipEmailParams,
  ): Promise<void> {
    const { distributorName, distributorLogoUrl, distributorEmail, distributorPhone, portalUrl } = params;
    const subject = `${headerSafe(distributorName)} activated your account`;
    const distributorContactLine = [distributorEmail, distributorPhone].filter((v): v is string => !!v).join(' or ');

    const text = [
      `${distributorName} has set up your account on Stocdup. You can now browse their catalogue and place orders.`,
      ...(portalUrl ? ['', `Browse their catalogue:`, portalUrl] : []),
      ``,
      `Through Stocdup, you can:`,
      `- Browse ${distributorName}'s catalogue`,
      `- See your agreed products and prices`,
      `- Choose an available delivery date`,
      `- Place and review orders online`,
      ``,
      ...(distributorContactLine
        ? [`Questions about your account, products or pricing? Contact ${distributorName} at ${distributorContactLine}.`, ``]
        : []),
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
      ``,
      `Stocdup provides the online ordering service used by ${distributorName}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('trade-relationship-activated', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      distributorName: esc(distributorName),
      portalUrl: portalUrl ? esc(portalUrl) : '',
      distributorLogoUrl: distributorLogoUrl ? esc(distributorLogoUrl) : '',
      identityText: `<strong>${esc(distributorName)}</strong> has set up your account on Stocdup. You can now browse their catalogue and place orders.`,
      identityRowGap: '24',
      identityBorderColor: '#E6ECF2',
      distributorContactLine: esc(distributorContactLine),
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'trade-relationship activated');
  }

  async sendAccountingConnectionNeedsReconnect(
    to: string,
    params: { distributorName: string; provider: string; reconnectUrl: string },
  ): Promise<void> {
    const { distributorName, provider, reconnectUrl } = params;
    const subject = `${headerSafe(provider)} needs to be reconnected`;
    const text = this.wrapText([
      `Hi,`,
      ``,
      `${distributorName}'s ${provider} connection has stopped working and needs to be reconnected before syncing can resume.`,
      ``,
      `Reconnect:`,
      reconnectUrl,
    ]);

    const html = this.wrapHtml(`
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Hi,</p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
        <strong>${esc(distributorName)}</strong>'s <strong>${esc(provider)}</strong> connection has stopped working and needs to be reconnected before syncing can resume.
      </p>
      ${this.button(reconnectUrl, 'Reconnect')}
    `);

    await this.send(to, subject, text, html, 'accounting-connection needs-reconnect');
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
