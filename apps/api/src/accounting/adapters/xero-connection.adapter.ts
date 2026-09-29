import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address, Contact, CurrencyCode, Invoice, Item, LineAmountTypes, LineItem, TaxRate, XeroClient } from 'xero-node';
import {
  AccountingConnectionAdapter,
  AccountingExternalContact,
  AccountingExternalOrganisation,
  AccountingExternalProduct,
  AccountingExternalTaxRate,
  AccountingFetchResult,
  AccountingInvoiceRequest,
  AccountingInvoiceResult,
  AccountingInvoiceTargetStatusValue,
  AccountingTokenSet,
} from './accounting-connection-adapter.interface';
import { AccountingProviderError } from './accounting-provider.error';
import { AccountingCallBudgetService } from '../accounting-call-budget.service';
import { parseXeroSdkError, ParsedXeroError, readRateLimitHeaders } from './xero-errors';

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

// xero-node's own tokenRequest() posts here (node_modules/xero-node/dist/XeroClient.js) —
// called directly for refreshAccessToken so the request can carry a real
// AbortSignal timeout; see the comment on refreshAccessToken below.
const XERO_TOKEN_ENDPOINT = 'https://identity.xero.com/connect/token';
// Xero's token endpoint should respond quickly; bounded generously enough to
// absorb ordinary latency while still giving up well within the accounting
// refresh lock's TTL (ACCOUNTING_REFRESH_LOCK_TTL_MS).
const REFRESH_HTTP_TIMEOUT_MS = 10_000;

// Xero's published limits are 60 calls/min, 5,000/day and 5 concurrent per
// organisation (verified 2026-09-29, developer.xero.com rate limits). The
// budget keeps a margin under the per-minute limit. Concurrency needs no
// guard of its own: the sync dedupe allows one run per (connection, resource
// type) and invoice export runs at concurrency 1, so at most 5 sequential
// call streams exist per organisation — raise export concurrency and that
// stops being true.
const XERO_CALLS_PER_ORG_PER_MINUTE = 50;
const XERO_DAILY_LIMIT = 5_000;
const DAY_LIMIT_WARN_BELOW = XERO_DAILY_LIMIT / 10;
// xero-node sets no request timeout, so a stalled connection would otherwise
// hold a worker lane forever. On timeout the request may still complete at
// Xero; every write we make carries an idempotency key, so a retry is safe.
const XERO_CALL_TIMEOUT_MS = 60_000;
// Contacts page size: Xero's maximum (verified); default is 100.
const CONTACTS_PAGE_SIZE = 1000;
// A cursor re-reads this much before the newest change it has seen, so a
// record written in the same second as the last fetch is never skipped.
// Re-reading is harmless: upserts compare fields.
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;

class XeroCallTimeoutError extends Error {
  constructor(op: string) {
    super(`Xero ${op} did not respond within ${XERO_CALL_TIMEOUT_MS / 1000}s`);
    this.name = 'XeroCallTimeoutError';
  }
}

// The cursor is an ISO UTC timestamp — opaque to everything outside this
// adapter. nextCursor never moves backwards.
function nextXeroCursor(previous: string | null | undefined, updatedAt: Array<Date | string | undefined>): string | null {
  const times = updatedAt
    .map((u) => (u ? new Date(u).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const prev = previous ? new Date(previous).getTime() : NaN;
  if (times.length === 0) return Number.isFinite(prev) ? new Date(prev).toISOString() : null;
  const candidate = Math.max(...times) - CURSOR_OVERLAP_MS;
  return new Date(Number.isFinite(prev) ? Math.max(prev, candidate) : candidate).toISOString();
}

function cursorToDate(cursor: string | null | undefined): Date | undefined {
  if (!cursor) return undefined;
  const d = new Date(cursor);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

export { nextXeroCursor };

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

  constructor(
    private readonly config: ConfigService,
    private readonly budget: AccountingCallBudgetService,
  ) {
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

  // Deliberately bypasses xero-node's client.refreshWithRefreshToken: it
  // wraps a raw axios call with no way to inject a timeout/AbortSignal, so a
  // stalled Xero response can't be genuinely cancelled through it — a
  // Promise.race around it would let a caller give up while the underlying
  // request keeps running and could still consume/rotate the (single-use)
  // refresh token after we've already told ourselves we gave up. Calling the
  // token endpoint directly with fetch + AbortSignal.timeout gives a real
  // transport-level cancel. Request shape below is verbatim what xero-node's
  // own tokenRequest() sends (node_modules/xero-node/dist/XeroClient.js).
  async refreshAccessToken(tokenSet: AccountingTokenSet): Promise<AccountingTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenSet.refreshToken,
    });

    let response: Response;
    try {
      response = await fetch(XERO_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(REFRESH_HTTP_TIMEOUT_MS),
      });
    } catch (err) {
      // No HTTP response at all: DNS/connection failure, or our own
      // AbortSignal.timeout firing — none of these carry a status to
      // classify, and none indicate anything about the refresh token itself,
      // so they're always transient.
      throw new AccountingProviderError(
        `Xero token refresh request failed: ${err instanceof Error ? err.message : String(err)}`,
        true,
        err,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      throw this.toRefreshTokenError(response.status, payload);
    }

    const raw = payload as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string };
    if (raw.expires_in == null) {
      throw new AccountingProviderError('Xero token refresh response was missing expires_in', true, payload);
    }
    // Bypassing openid-client's TokenSet wrapper (which normally computes
    // expires_at from expires_in on assignment) means we compute it
    // ourselves here — everything downstream of this adapter deals in the
    // absolute expires_at, never expires_in.
    return this.toAccountingTokenSet({
      ...raw,
      expires_at: Math.floor(Date.now() / 1000) + raw.expires_in,
    });
  }

  // Refresh-specific classification, deliberately separate from
  // toProviderError below: that classifier's messages and 400/401/403 ==
  // "permanent" rule were written for createInvoice's REST-API error shape
  // ({Message, Elements}). The token endpoint speaks plain OAuth2
  // ({error, error_description}), and refresh failures need finer-grained
  // handling than invoice failures — specifically, invalid_grant (dead/
  // reused refresh token, distributor must reconnect) and invalid_client
  // (our application's client id/secret is wrong — reconnecting re-uses the
  // same credentials and won't help; this needs an engineer, not the
  // distributor) mean different things and should produce different
  // downstream behaviour, not just an identical "permanent" bucket.
  private toRefreshTokenError(status: number, body: unknown): AccountingProviderError {
    const oauthError = (body as { error?: string; error_description?: string } | undefined) ?? {};
    const description = oauthError.error_description ? `: ${oauthError.error_description}` : '';

    if (oauthError.error === 'invalid_grant') {
      return new AccountingProviderError(
        `Xero refresh token is no longer valid (invalid_grant)${description} — reconnecting Xero is required`,
        false,
        body,
        'invalid_grant',
      );
    }
    if (oauthError.error === 'invalid_client') {
      return new AccountingProviderError(
        `Xero rejected this application's credentials (invalid_client)${description}`,
        false,
        body,
        'invalid_client',
      );
    }
    // Rate limit / provider-side fault: worth retrying. Anything else 4xx is
    // a client-side problem that won't change on identical retry, but isn't
    // confidently "the refresh token is dead" either — kept permanent
    // (don't burn retries on it) with a generic message rather than
    // overclaiming what's wrong.
    const transient = status === 429 || status >= 500;
    return new AccountingProviderError(
      `Xero token refresh failed with HTTP ${status}${oauthError.error ? ` (${oauthError.error})` : ''}${description}`,
      transient,
      body,
      oauthError.error,
    );
  }

  async listContacts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    cursor?: string | null,
  ): Promise<AccountingFetchResult<AccountingExternalContact>> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    const modifiedSince = cursorToDate(cursor);
    const contacts: Contact[] = [];
    let page = 1;
    // Paged; loop until a short page ends it.
    for (;;) {
      const { body } = await this.call('getContacts', externalOrganisationId, () =>
        client.accountingApi.getContacts(
          externalOrganisationId,
          modifiedSince,
          undefined, // where
          undefined, // order
          undefined, // iDs
          page,
          true, // includeArchived — Archived is a status this feature surfaces
          undefined, // summaryOnly
          undefined, // searchTerm
          CONTACTS_PAGE_SIZE,
        ),
      );
      const batch = body.contacts ?? [];
      contacts.push(...batch);
      if (batch.length < CONTACTS_PAGE_SIZE) break;
      page += 1;
    }
    return {
      records: contacts.map((c) => this.toAccountingExternalContact(c)),
      nextCursor: nextXeroCursor(cursor, contacts.map((c) => c.updatedDateUTC)),
    };
  }

  async listProducts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    cursor?: string | null,
  ): Promise<AccountingFetchResult<AccountingExternalProduct>> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    // Unlike getContacts, Xero's Items endpoint has no pagination — one call
    // returns every item (item counts are small relative to contacts).
    // unitdp=4 opts in to four-decimal-place unit prices; the cache column is
    // Decimal(12,4) to hold them losslessly.
    const { body } = await this.call('getItems', externalOrganisationId, () =>
      client.accountingApi.getItems(
        externalOrganisationId,
        cursorToDate(cursor),
        undefined, // where
        undefined, // order
        4, // unitdp
      ),
    );
    const items = body.items ?? [];
    return {
      records: items.map((item) => this.toAccountingExternalProduct(item)),
      nextCursor: nextXeroCursor(cursor, items.map((item) => item.updatedDateUTC)),
    };
  }

  async listTaxRates(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
  ): Promise<AccountingExternalTaxRate[]> {
    const client = this.buildClient();
    client.setTokenSet(this.toXeroTokenSetParams(tokenSet));
    // Unlike getContacts, Xero's TaxRates endpoint has no pagination — one
    // call returns every tax rate (org tax-rate counts are small).
    const { body } = await this.call('getTaxRates', externalOrganisationId, () =>
      client.accountingApi.getTaxRates(externalOrganisationId),
    );
    return (body.taxRates ?? []).map((taxRate) => this.toAccountingExternalTaxRate(taxRate));
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

    const { body } = await this.call('createInvoices', externalOrganisationId, () =>
      client.accountingApi.createInvoices(
        externalOrganisationId,
        { invoices: [invoice] },
        true, // summarizeErrors — all-or-nothing, a validation failure throws
        4, // unitdp
        idempotencyKey,
      ),
    );

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

  // The single path every Accounting API call takes: per-organisation call
  // budget, a hard timeout, one structured log line per call, and failures
  // turned into a clean AccountingProviderError. Nothing raw from the
  // provider (body, headers, the SDK's error string) gets past this method.
  private async call<T extends { response: { status?: number; headers?: unknown } }>(
    op: string,
    externalOrganisationId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.budget.acquire('XERO', externalOrganisationId, XERO_CALLS_PER_ORG_PER_MINUTE);
    const started = Date.now();
    const baseFields = { provider: 'XERO', externalOrgId: externalOrganisationId, op };

    let result: T;
    try {
      result = await this.withTimeout(op, fn());
    } catch (err) {
      const parsed = parseXeroSdkError(err);
      const providerError = this.toProviderError(op, parsed);
      this.logger.warn(
        {
          event: 'accounting.provider.call_failed',
          ...baseFields,
          statusCode: parsed.statusCode,
          durationMs: Date.now() - started,
          transient: providerError.transient,
          retryAfterMs: parsed.retryAfterMs,
          validationMessages: parsed.validationMessages.length > 0 ? parsed.validationMessages : undefined,
          xeroCorrelationId: parsed.correlationId,
        },
        providerError.message,
      );
      throw providerError;
    }

    const limits = readRateLimitHeaders(result.response?.headers as Record<string, unknown> | undefined);
    const fields = {
      ...baseFields,
      statusCode: result.response?.status,
      durationMs: Date.now() - started,
      minRemaining: limits.minRemaining,
      dayRemaining: limits.dayRemaining,
      appMinRemaining: limits.appMinRemaining,
      xeroCorrelationId: limits.correlationId,
    };
    this.logger.debug({ event: 'accounting.provider.call', ...fields }, `Xero ${op} ${result.response?.status ?? ''}`);
    if (limits.dayRemaining !== undefined && limits.dayRemaining < DAY_LIMIT_WARN_BELOW) {
      this.logger.warn(
        { event: 'accounting.provider.day_limit_low', ...fields },
        `Xero daily call limit low for org ${externalOrganisationId}: ${limits.dayRemaining} of ${XERO_DAILY_LIMIT} left`,
      );
    }
    return result;
  }

  private withTimeout<T>(op: string, pending: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new XeroCallTimeoutError(op)), XERO_CALL_TIMEOUT_MS);
    });
    return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
  }

  // Classification: rate limits (429), Xero-side faults (5xx) and transport
  // failures are worth retrying; validation (400) and authorisation
  // (401/403) failures are not — they need user action (fix mappings/codes,
  // or reconnect). The message is built only from Xero's own validation /
  // error text, never the raw response, so it is safe to persist on export
  // rows, show in admin notifications, and log.
  private toProviderError(op: string, parsed: ParsedXeroError): AccountingProviderError {
    const { statusCode } = parsed;
    const transient = statusCode === undefined || statusCode === 429 || statusCode >= 500;
    const detail =
      parsed.validationMessages.length > 0 ? parsed.validationMessages.join('; ') : parsed.xeroMessage;

    let message: string;
    if (statusCode === undefined) {
      message = `Xero ${op} request failed: ${parsed.transportMessage ?? 'no response'}`;
    } else if (op === 'createInvoices' && statusCode === 400 && detail) {
      message = `Xero rejected the invoice: ${detail}`;
    } else if (statusCode === 429) {
      message = `Xero rate limit reached during ${op}${
        parsed.retryAfterMs !== undefined ? ` — retry after ${Math.ceil(parsed.retryAfterMs / 1000)}s` : ''
      }`;
    } else {
      message = `Xero ${op} failed with HTTP ${statusCode}${detail ? `: ${detail}` : ''}`;
    }

    return new AccountingProviderError(
      message,
      transient,
      parsed,
      statusCode === undefined ? 'NETWORK' : `HTTP_${statusCode}`,
      { statusCode, retryAfterMs: parsed.retryAfterMs },
    );
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

  private toAccountingExternalTaxRate(taxRate: TaxRate): AccountingExternalTaxRate {
    return {
      // taxType is Xero's natural key for a tax rate — there is no GUID.
      taxType: taxRate.taxType ?? '',
      displayName: taxRate.name || taxRate.taxType || '',
      ratePercentage: taxRate.displayTaxRate != null ? String(taxRate.displayTaxRate) : '0',
      isActive: taxRate.status === TaxRate.StatusEnum.ACTIVE,
      raw: taxRate,
    };
  }

  private toAccountingExternalContact(contact: Contact): AccountingExternalContact {
    // DELIVERY is not a valid AddressType for Contacts (it's Xero-org-only) —
    // a contact can only ever carry POBOX and/or STREET. This matches Xero's
    // own UI convention, which by default sends the UI's Billing address to
    // POBOX and its Delivery/Shipping address to STREET. POBOX falls back to
    // STREET for billing when no POBOX is set (a contact with only one
    // address on file still gets a usable billing address); STREET has no
    // fallback for delivery — a PO box isn't a deliverable address.
    const billingAddress =
      contact.addresses?.find((a) => a.addressType === Address.AddressTypeEnum.POBOX) ??
      contact.addresses?.find((a) => a.addressType === Address.AddressTypeEnum.STREET);
    const deliveryAddress = contact.addresses?.find((a) => a.addressType === Address.AddressTypeEnum.STREET);
    return {
      externalId: contact.contactID ?? '',
      code: contact.contactNumber || undefined,
      accountNumber: contact.accountNumber || undefined,
      displayName: contact.name ?? '',
      email: contact.emailAddress || undefined,
      billingLine1: billingAddress?.addressLine1 || undefined,
      billingLine2: billingAddress?.addressLine2 || undefined,
      billingCity: billingAddress?.city || undefined,
      billingState: billingAddress?.region || undefined,
      billingPostcode: billingAddress?.postalCode || undefined,
      billingCountry: billingAddress?.country || undefined,
      deliveryLine1: deliveryAddress?.addressLine1 || undefined,
      deliveryLine2: deliveryAddress?.addressLine2 || undefined,
      deliveryCity: deliveryAddress?.city || undefined,
      deliveryState: deliveryAddress?.region || undefined,
      deliveryPostcode: deliveryAddress?.postalCode || undefined,
      deliveryCountry: deliveryAddress?.country || undefined,
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
