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

export interface OrderLineItem {
  productName: string;
  sku: string | null;
  quantity: number;
  lineTotal: string;
}

// totalAmount/currency/requestedDeliveryDate/customerReference/lineItemCount/
// orderLines are all nullable: events written before these fields existed
// replay without them, and PO reference in particular is genuinely optional
// on the order itself.
export interface SendOrderPlacedToDistributorParams {
  customerName: string;
  orderNumber: string;
  orderUrl: string;
  totalAmount: string | null;
  currency: string | null;
  requestedDeliveryDate: string | null;
  customerReference: string | null;
  lineItemCount: number | null;
  orderLines: OrderLineItem[] | null;
}

export interface SendAccountingReconnectParams {
  distributorName: string;
  provider: string;
  reconnectUrl: string;
  reason: string;
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

  // distributorLogoUrl/distributorEmail/distributorPhone are optional and
  // degrade gracefully when absent (no broken image, no empty "contact"
  // line) — see the template's {{#if}} blocks.
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

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/order-placed-distributor.mjml. Unlike
  // the customer order emails, this one carries the full "should I care
  // right now" fact set (total, item count, requested delivery, PO
  // reference) since the recipient is the distributor's own ops team, not
  // a trade customer — closing a real gap, not just a re-skin.
  async sendOrderPlacedToDistributor(to: string, params: SendOrderPlacedToDistributorParams): Promise<void> {
    const { customerName, orderNumber, orderUrl, totalAmount, currency, requestedDeliveryDate, customerReference, lineItemCount, orderLines } = params;
    const subject = `New order from ${headerSafe(customerName)}`;

    const orderTotalFormatted = totalAmount && currency ? `${currency} ${totalAmount}` : null;
    const requestedDeliveryDateFormatted = requestedDeliveryDate
      ? new Date(requestedDeliveryDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const hasOrderLines = !!orderLines && orderLines.length > 0;

    const text = [
      `${customerName} placed order ${orderNumber}.`,
      ``,
      ...(orderTotalFormatted ? [`Order total: ${orderTotalFormatted}`] : []),
      ...(requestedDeliveryDateFormatted ? [`Requested delivery: ${requestedDeliveryDateFormatted}`] : []),
      ...(customerReference ? [`PO reference: ${customerReference}`] : []),
      ``,
      ...(hasOrderLines
        ? [
            `Items (${lineItemCount ?? orderLines!.length}):`,
            ...orderLines!.map((l) => `- ${l.productName}${l.sku ? ` (${l.sku})` : ''} × ${l.quantity} — ${l.lineTotal}`),
            ``,
          ]
        : []),
      `Review the order:`,
      orderUrl,
      ``,
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('order-placed-distributor', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      customerName: esc(customerName),
      orderNumber: esc(orderNumber),
      orderUrl: esc(orderUrl),
      orderTotalFormatted: orderTotalFormatted ? esc(orderTotalFormatted) : '',
      requestedDeliveryDateFormatted: requestedDeliveryDateFormatted ? esc(requestedDeliveryDateFormatted) : '',
      customerReference: customerReference ? esc(customerReference) : '',
      hasOrderLines: hasOrderLines ? 'true' : '',
      lineItemCount: hasOrderLines ? String(lineItemCount ?? orderLines!.length) : '',
      orderLinesHtml: hasOrderLines ? orderLines!.map((l) => this.renderOrderLineRow(l)).join('') : '',
      stocdupSupportEmail: esc(this.supportEmail),
    });

    await this.send(to, subject, text, html, 'order-placed distributor');
  }

  // One row per ordered product for the distributor's new-order email — the
  // templating engine (mail-template.ts) has no loop construct, so this is
  // built here and passed through as one pre-rendered HTML string
  // (orderLinesHtml), the same pattern already used for identityText.
  private renderOrderLineRow(line: OrderLineItem): string {
    const skuQty = line.sku ? `${esc(line.sku)} · Qty ${line.quantity}` : `Qty ${line.quantity}`;
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-bottom:1px solid #E6ECF2;"><tr>
        <td valign="top" style="padding:12px 0;font-size:14px;color:#0B1D3A;">
          <strong>${esc(line.productName)}</strong><br/>
          <span style="font-size:12px;color:#5B6B7F;">${skuQty}</span>
        </td>
        <td valign="top" align="right" style="padding:12px 0 12px 12px;font-size:14px;color:#0B1D3A;white-space:nowrap;">
          ${esc(line.lineTotal)}
        </td>
      </tr></table>
    `;
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

  // Built from a real MJML template matching the portal's design system —
  // see apps/api/src/mail/templates/accounting-reconnect.mjml. `reason` is
  // the real error message (already used for the in-app notification's
  // body) now also reaching the email — previously the email said only
  // that something broke, not why.
  async sendAccountingConnectionNeedsReconnect(to: string, params: SendAccountingReconnectParams): Promise<void> {
    const { distributorName, provider, reconnectUrl, reason } = params;
    const subject = `${headerSafe(provider)} needs to be reconnected`;

    const text = [
      `${distributorName}'s ${provider} connection has stopped working, and syncing is paused until it's reconnected.`,
      ``,
      reason,
      ``,
      `Reconnect:`,
      reconnectUrl,
      ``,
      `Need help using Stocdup? Contact ${this.supportEmail}.`,
    ].join('\n');

    const html = await compileMjmlTemplate('accounting-reconnect', {
      stocdupIconUrl: esc(this.logoOnlyUrl),
      provider: esc(provider),
      reconnectUrl: esc(reconnectUrl),
      reason: esc(reason),
      stocdupSupportEmail: esc(this.supportEmail),
    });

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
