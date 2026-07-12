import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address, Contact, CurrencyCode, Invoice, Item, LineAmountTypes, LineItem, XeroClient } from 'xero-node';
import {
  AccountingConnectionAdapter,
  AccountingExternalContact,
  AccountingExternalOrganisation,
  AccountingExternalProduct,
  AccountingInvoiceRequest,
  AccountingInvoiceResult,
  AccountingInvoiceTargetStatusValue,
  AccountingTokenSet,
} from './accounting-connection-adapter.interface';
import { AccountingProviderError } from './accounting-provider.error';

// Xero requests all scopes up front (including contacts/settings, unused
// until Phases 2-3) because Xero scopes cannot be silently expanded after
// the distributor has consented — asking now avoids a second consent round trip.
// accounting.invoices (invoice creation, Phase 4) was added later, so
// connections consented before it must reconnect — the invoice export worker
// checks the connection's granted scopes and fails with SCOPE_MISSING rather
// than calling Xero with a token that would 403.
//
// accounting.invoices is one of Xero's granular scopes: the broad
// accounting.transactions scope is deprecated and apps created on/after
// 2026-03-02 get error=invalid_scope if they request it at all.
// https://developer.xero.com/faq/granular-scopes
const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.contacts',
  'accounting.settings',
  'accounting.invoices',
  'offline_access',
];

const XERO_INVOICE_STATUS: Record<AccountingInvoiceTargetStatusValue, Invoice.StatusEnum> = {
  DRAFT: Invoice.StatusEnum.DRAFT,
  SUBMITTED: Invoice.StatusEnum.SUBMITTED,
  AUTHORISED: Invoice.StatusEnum.AUTHORISED,
};

@Injectable()
export class XeroAccountingAdapter implements AccountingConnectionAdapter {
  private readonly logger = new Logger(XeroAccountingAdapter.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.getOrThrow<string>('XERO_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('XERO_CLIENT_SECRET');
    // This is apps/admin-api's public callback URL, not a route on this
    // service — Xero's redirect lands on admin-api (the public origin),
    // which calls this service's internal /accounting/xero/callback
    // endpoint server-to-server. xero-node still needs this value verbatim
    // for the token-exchange request regardless of who received the redirect.
    this.redirectUri = config.getOrThrow<string>('XERO_REDIRECT_URI');
  }

  // xero-node's XeroClient pins `state` at construction (it's checked
  // internally on the callback), so a fresh client is built per state value.
  private buildClient(state?: string): XeroClient {
    return new XeroClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUris: [this.redirectUri],
      scopes: XERO_SCOPES,
      state,
    });
  }

  async buildAuthorizationUrl(state: string): Promise<string> {
    const client = this.buildClient(state);
    return client.buildConsentUrl();
  }

  async exchangeCodeForToken(callbackUrl: string, expectedState: string): Promise<AccountingTokenSet> {
    const client = this.buildClient(expectedState);
    const tokenSet = await client.apiCallback(callbackUrl);
    return this.toAccountingTokenSet(tokenSet);
  }

  async listAvailableOrganisations(tokenSet: AccountingTokenSet): Promise<AccountingExternalOrganisation[]> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    const tenants = await client.updateTenants(false);
    return tenants.map((tenant: { tenantId: string; tenantName: string }) => ({
      externalId: tenant.tenantId,
      name: tenant.tenantName,
    }));
  }

  async refreshAccessToken(tokenSet: AccountingTokenSet): Promise<AccountingTokenSet> {
    const client = this.buildClient();
    const refreshed = await client.refreshWithRefreshToken(this.clientId, this.clientSecret, tokenSet.refreshToken);
    return this.toAccountingTokenSet(refreshed);
  }

  async listContacts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    modifiedSince?: Date,
  ): Promise<AccountingExternalContact[]> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    const contacts: Contact[] = [];
    let page = 1;
    // xero-node paginates at 100 contacts/page; loop until a short page ends it.
    for (;;) {
      const { body } = await client.accountingApi.getContacts(
        externalOrganisationId,
        modifiedSince,
        undefined, // where
        undefined, // order
        undefined, // iDs
        page,
        true, // includeArchived — Archived is a status this feature surfaces
      );
      const batch = body.contacts ?? [];
      contacts.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }
    return contacts.map((c) => this.toAccountingExternalContact(c));
  }

  async listProducts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    modifiedSince?: Date,
  ): Promise<AccountingExternalProduct[]> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    // Unlike getContacts, Xero's Items endpoint has no pagination — one call
    // returns every item (item counts are small relative to contacts).
    // unitdp=4 opts in to four-decimal-place unit prices; the cache column is
    // Decimal(12,4) to hold them losslessly.
    const { body } = await client.accountingApi.getItems(
      externalOrganisationId,
      modifiedSince,
      undefined, // where
      undefined, // order
      4, // unitdp
    );
    return (body.items ?? []).map((item) => this.toAccountingExternalProduct(item));
  }

  hasInvoiceCreationScope(grantedScopes: string): boolean {
    // The legacy broad accounting.transactions scope also grants invoice
    // creation — connections on apps grandfathered before Xero's granular
    // scopes cutover (2026-03-02) may still carry it.
    const scopes = grantedScopes.split(' ');
    return scopes.includes('accounting.invoices') || scopes.includes('accounting.transactions');
  }

  async createInvoice(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    request: AccountingInvoiceRequest,
    idempotencyKey: string,
  ): Promise<AccountingInvoiceResult> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));

    const lineItems: LineItem[] = request.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      // Decimal string → number only here, at the SDK boundary; unitdp=4
      // below keeps four decimal places rather than rounding to two.
      unitAmount: Number(line.unitPrice),
      ...(line.externalItemCode ? { itemCode: line.externalItemCode } : {}),
      ...(line.taxCode ? { taxType: line.taxCode } : {}),
      ...(line.accountCode ? { accountCode: line.accountCode } : {}),
    }));

    const invoice: Invoice = {
      type: Invoice.TypeEnum.ACCREC,
      contact: { contactID: request.externalContactId },
      date: request.issueDate,
      reference: request.reference,
      currencyCode: CurrencyCode[request.currency as keyof typeof CurrencyCode],
      // Wholo order prices are tax-exclusive (tax is carried separately on
      // the order); Xero derives the tax from each line's taxType or, for
      // unmapped lines, the account default.
      lineAmountTypes: LineAmountTypes.Exclusive,
      status: XERO_INVOICE_STATUS[request.targetStatus],
      lineItems,
    };

    let body;
    try {
      ({ body } = await client.accountingApi.createInvoices(
        externalOrganisationId,
        { invoices: [invoice] },
        true, // summarizeErrors — all-or-nothing, a validation failure throws
        4, // unitdp
        idempotencyKey,
      ));
    } catch (err) {
      throw this.toProviderError(err);
    }

    const created = body.invoices?.[0];
    if (!created?.invoiceID) {
      throw new AccountingProviderError('Xero returned no invoice for the create request', false);
    }
    return {
      externalInvoiceId: created.invoiceID,
      externalInvoiceNumber: created.invoiceNumber || undefined,
      // The generated enums are string-valued at runtime ('DRAFT' etc.)
      // despite their numeric-looking declarations.
      externalInvoiceStatus: created.status != null ? String(created.status) : undefined,
      raw: created,
    };
  }

  // Xero SDK errors carry the HTTP response on err.response; classify by
  // status: rate limits (429) and Xero-side faults (5xx) are worth retrying,
  // validation (400) and authorisation (401/403) failures are not — they need
  // user action (fix mappings/codes, or reconnect). No response = network
  // fault = transient.
  private toProviderError(err: unknown): AccountingProviderError {
    const statusCode = (err as { response?: { statusCode?: number; status?: number } })?.response?.statusCode
      ?? (err as { response?: { status?: number } })?.response?.status;
    const transient = statusCode == null || statusCode === 429 || statusCode >= 500;
    const detail = this.extractXeroErrorDetail(err);
    const message = detail
      ? `Xero rejected the invoice: ${detail}`
      : statusCode
        ? `Xero request failed with HTTP ${statusCode}`
        : `Xero request failed: ${err instanceof Error ? err.message : String(err)}`;
    return new AccountingProviderError(message, transient, err);
  }

  private extractXeroErrorDetail(err: unknown): string | undefined {
    const body = (err as { response?: { body?: unknown } })?.response?.body as
      | {
          Message?: string;
          Elements?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>;
        }
      | undefined;
    const validationMessages = (body?.Elements ?? [])
      .flatMap((el) => el.ValidationErrors ?? [])
      .map((v) => v.Message)
      .filter((m): m is string => !!m);
    if (validationMessages.length > 0) return validationMessages.join('; ');
    return body?.Message;
  }

  private toAccountingExternalProduct(item: Item): AccountingExternalProduct {
    return {
      externalId: item.itemID ?? '',
      // code is Xero's required user-facing item code (the SKU analog);
      // name is optional, so display falls back to code.
      code: item.code || undefined,
      displayName: item.name || item.code || '',
      description: item.description || undefined,
      salesUnitPrice: item.salesDetails?.unitPrice != null ? String(item.salesDetails.unitPrice) : undefined,
      purchaseUnitPrice: item.purchaseDetails?.unitPrice != null ? String(item.purchaseDetails.unitPrice) : undefined,
      taxCode: item.salesDetails?.taxType || undefined,
      accountCode: item.salesDetails?.accountCode || undefined,
      purchaseTaxCode: item.purchaseDetails?.taxType || undefined,
      purchaseAccountCode: item.purchaseDetails?.accountCode || undefined,
      // Xero defaults both to true and only serialises them when set.
      isSold: item.isSold ?? true,
      isPurchased: item.isPurchased ?? true,
      isTracked: !!item.isTrackedAsInventory,
      // Xero Items carry no archived/deleted status — deleted items simply
      // stop appearing; the sync's stale-row pass owns deactivation.
      isActive: true,
      quantityOnHand: item.quantityOnHand != null ? String(item.quantityOnHand) : undefined,
      updatedAt: item.updatedDateUTC ? new Date(item.updatedDateUTC).toISOString() : undefined,
      raw: item,
    };
  }

  private toAccountingExternalContact(contact: Contact): AccountingExternalContact {
    // Xero has no distinct "billing address" type — STREET is the closest
    // equivalent to a postal/billing address; POBOX is the fallback.
    const address =
      contact.addresses?.find((a) => a.addressType === Address.AddressTypeEnum.STREET) ?? contact.addresses?.[0];
    return {
      externalId: contact.contactID ?? '',
      code: contact.contactNumber || undefined,
      accountNumber: contact.accountNumber || undefined,
      displayName: contact.name ?? '',
      email: contact.emailAddress || undefined,
      billingLine1: address?.addressLine1 || undefined,
      billingLine2: address?.addressLine2 || undefined,
      billingCity: address?.city || undefined,
      billingState: address?.region || undefined,
      billingPostcode: address?.postalCode || undefined,
      billingCountry: address?.country || undefined,
      isCustomer: !!contact.isCustomer,
      isSupplier: !!contact.isSupplier,
      isArchived: contact.contactStatus === Contact.ContactStatusEnum.ARCHIVED,
      updatedAt: contact.updatedDateUTC ? new Date(contact.updatedDateUTC).toISOString() : undefined,
      raw: contact,
    };
  }

  private toAccountingTokenSet(tokenSet: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    id_token?: string;
    scope?: string;
  }): AccountingTokenSet {
    if (!tokenSet.access_token || !tokenSet.refresh_token || !tokenSet.expires_at) {
      throw new Error('Xero token exchange did not return a complete token set');
    }
    return {
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      expiresAt: new Date(tokenSet.expires_at * 1000).toISOString(),
      idToken: tokenSet.id_token,
      scope: tokenSet.scope ?? XERO_SCOPES.join(' '),
    };
  }

  private toXeroTokenSetParams(tokenSet: AccountingTokenSet) {
    return {
      access_token: tokenSet.accessToken,
      refresh_token: tokenSet.refreshToken,
      expires_at: Math.floor(new Date(tokenSet.expiresAt).getTime() / 1000),
      id_token: tokenSet.idToken,
      scope: tokenSet.scope,
    };
  }
}

export { XERO_SCOPES };
