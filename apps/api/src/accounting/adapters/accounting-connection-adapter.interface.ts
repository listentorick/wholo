// ═══ Accounting integration framework ══════════════════════════════════════
//
// Stocdup connects to a distributor's accounting system through a
// PROVIDER-NEUTRAL framework. Xero is the first provider; others (QuickBooks,
// Sage, MYOB, …) plug in the same way. This file is the framework's front
// door: the overview below, then the port every provider implements.
//
// Who owns what (ADR-006): Stocdup owns products, prices and orders; the
// accounting system is the system of record for invoices, payments and
// balances. Stocdup never takes a price from the provider.
//
// ── The layers (and where each lives) ─────────────────────────────────────
//  1. Provider boundary — AccountingConnectionAdapter (below), one class per
//     provider under accounting/adapters/, registered in
//     AccountingAdapterRegistry. EVERYTHING provider-specific stays behind it:
//     SDK, OAuth details, field names and statuses, cursors, rate limits,
//     error codes, display name. Nothing outside accounting/adapters/ may
//     import a provider SDK or a concrete adapter, or branch on which
//     provider it is (enforced by accounting/accounting-framework.arch.spec.ts).
//  2. Tokens — AccountingConnectionService.getValidTokenSet is the only way
//     to get a usable token (serialised refresh, ERROR-state handling).
//  3. Triggers — scheduled pulls, manual Sync and retries all go through the
//     outbox and IngestionRunService.requestRun (sync/accounting-sync.service.ts),
//     never straight onto a queue.
//  4. Pulls — every job that reads provider data extends
//     AccountingPullProcessorBase (sync/accounting-pull-processor.base.ts —
//     the guide and checklist for pulls). Reviewed-and-mapped record types
//     extend AccountingSyncProcessorBase on top of it.
//  5. Push — invoice export (accounting-invoice-export.processor.ts): its own
//     processor because it is per order with its own export row, but it uses
//     the same token gateway, failure policy and timing constants as the
//     pulls. An order is never invoiced twice (ADR-073): the export asks the
//     provider for the order's invoice (findInvoiceByReference) before every
//     createInvoice, and adopts it if it is already there.
//  6. Failures — classified once: adapters decide transient vs permanent
//     (AccountingProviderError); classifyJobFailure (accounting-job-failure.ts)
//     turns that into what the job does next.
//  7. Identity (ADR-074) — everything the distributor builds up against a
//     provider (cached records, links, suggestions, bulk imports, invoices
//     sent, settings) belongs to the AccountingOrganisation, i.e. the company
//     in that provider (distributor + provider + the id that
//     listAvailableOrganisations returns). A connection is only the login.
//     Every query over that data scopes itself with organisationScope
//     (accounting-organisation.ts), so a reconnect to the same company keeps
//     it all and only a different company starts empty. New tables of
//     provider data reference AccountingOrganisation, never the connection.
//  8. Derived state has one writer — invoice payment columns only through
//     InvoicePaymentStateService, order COMPLETED only through
//     OrderCompletionService (both enforced by ESLint).
//
// ── What every provider adapter must do ───────────────────────────────────
//  - Route EVERY provider API call through one private call path that:
//      · acquires AccountingCallBudgetService.acquire(provider, orgId,
//        perMinute) first, with the provider's own declared per-organisation
//        limit (kept safely under the provider's published limit);
//      · applies a timeout (SDKs often have none);
//      · logs one structured line per call (op, status, duration, limits left).
//    See XeroAccountingAdapter.call() for the reference implementation.
//  - Throw every failure as AccountingProviderError, classified the same way
//    for every provider:
//      · transient (retried with backoff): no response / network, rate limit
//        (with retryAfterMs from the provider when it says how long), provider
//        5xx, and an expired or invalid access token (the retry refreshes it);
//      · permanent (needs the user — fix data, or reconnect): validation
//        errors and other 4xx, including "forbidden for this organisation".
//    Messages are built only from the provider's own validation / error text,
//    never the raw response (it can carry tokens or personal data).
//  - Keep cursors opaque: encode whatever the provider supports and hand it
//    back in AccountingFetchResult.nextCursor; return null when it can't do
//    incremental pulls (the framework then always pulls in full).
//  - Cross the boundary in the neutral shapes below: decimals as strings,
//    calendar dates as YYYY-MM-DD, provider vocabulary only in `raw` /
//    `rawStatus` / `externalInvoiceStatus`.
//  - Provide `displayName` and the scope checks.
//
// ── Checklist: adding a provider ──────────────────────────────────────────
//  1. Add the value to the AccountingProvider enum (prisma migration; keep
//     apps/admin-api's schema copy in sync).
//  2. Implement AccountingConnectionAdapter in accounting/adapters/<provider>…
//     meeting every obligation above; unit-test it against a mocked SDK.
//  3. Register it in AccountingAdapterRegistry and AccountingModule.
//  4. Add its OAuth start route and callback, and its connection card in the
//     admin app. (Today these are Xero-named — the known provider-specific
//     edges outside the adapter; generalise them when the second provider
//     lands, along with the registry taking a list of adapters.)
//  5. Nothing in sync, export, payment status, matching or scheduling should
//     change. test/accounting-framework.integration-spec.ts drives the whole
//     framework through a fake provider — if a new provider needs changes
//     there, the port is leaking.
//
// Checklist for adding a new kind of PULL: see AccountingPullProcessorBase.
// ═══════════════════════════════════════════════════════════════════════════

export interface AccountingTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601
  idToken?: string;
  // Space-separated scopes actually granted by the provider (authoritative —
  // may differ from what was requested).
  scope: string;
}

export interface AccountingExternalOrganisation {
  externalId: string;
  name: string;
}

// One contact/customer record as cached from the provider's accounting
// system. Field names are deliberately generic (no Xero vocabulary) — this
// is the shape every provider adapter maps its own contact model onto.
export interface AccountingExternalContact {
  externalId: string;
  code?: string;
  accountNumber?: string;
  displayName: string;
  email?: string;
  billingLine1?: string;
  billingLine2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostcode?: string;
  billingCountry?: string;
  deliveryLine1?: string;
  deliveryLine2?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryPostcode?: string;
  deliveryCountry?: string;
  isCustomer: boolean;
  isSupplier: boolean;
  isArchived: boolean;
  updatedAt?: string; // ISO 8601
  raw: unknown;
}

// One product/item record as cached from the provider's accounting system.
// Same provider-neutral contract as AccountingExternalContact. Prices and
// quantities cross the adapter boundary as decimal strings, not numbers —
// they land in Prisma Decimal columns and must not pick up float drift on
// the way.
export interface AccountingExternalProduct {
  externalId: string;
  code?: string;
  displayName: string;
  description?: string;
  salesUnitPrice?: string;
  purchaseUnitPrice?: string;
  taxCode?: string;
  accountCode?: string;
  purchaseTaxCode?: string;
  purchaseAccountCode?: string;
  isSold: boolean;
  isPurchased: boolean;
  isTracked: boolean;
  // Providers without an archived/deleted flag on products (Xero included)
  // should return true here; the sync detects deletions by absence from the
  // full fetch instead.
  isActive: boolean;
  quantityOnHand?: string;
  updatedAt?: string; // ISO 8601
  raw: unknown;
}

// One tax rate record as cached from the provider's accounting system. Same
// provider-neutral contract as AccountingExternalContact/Product, with one
// deviation: Xero's TaxRate has no GUID, only `taxType` (a code string, e.g.
// "OUTPUT2") as its natural key — and no per-record modified timestamp, so
// (unlike contacts/products) there is no updatedAt field here at all.
export interface AccountingExternalTaxRate {
  taxType: string;
  displayName: string;
  // Decimal string, same convention as AccountingExternalProduct prices —
  // crosses the adapter boundary as a string so it lands in a Prisma Decimal
  // column without picking up float drift.
  ratePercentage: string;
  isActive: boolean;
  raw: unknown;
}

// Provider-neutral name for the status an invoice is created with in the
// accounting system. Mirrors the AccountingInvoiceTargetStatus Prisma enum
// (this file stays Prisma-free); each adapter maps it onto its provider's
// own status vocabulary.
export type AccountingInvoiceTargetStatusValue = 'DRAFT' | 'SUBMITTED' | 'AUTHORISED';

// One invoice line. Wholo is the pricing authority: description, quantity and
// unitPrice always come from the Wholo order line and must be sent explicitly
// — provider item defaults never determine the price. The external codes are
// optional enrichment from a confirmed product mapping; a line without them
// is still valid (the provider falls back to its own defaults for tax/account
// treatment only).
export interface AccountingInvoiceLineRequest {
  description: string;
  quantity: number;
  // Decimal string, same convention as AccountingExternalProduct prices.
  unitPrice: string;
  externalItemCode?: string;
  taxCode?: string;
  accountCode?: string;
}

export interface AccountingInvoiceRequest {
  // Confirmed CustomerAccountingMapping → cached external contact id. The
  // caller resolves this; adapters never match contacts themselves.
  externalContactId: string;
  // Wholo order number — lands in the provider's reference field.
  reference: string;
  // ISO 4217 code, e.g. 'GBP'.
  currency: string;
  // ISO date (YYYY-MM-DD) the invoice is issued.
  issueDate: string;
  targetStatus: AccountingInvoiceTargetStatusValue;
  lines: AccountingInvoiceLineRequest[];
}

export interface AccountingInvoiceResult {
  externalInvoiceId: string;
  // Some providers defer numbering (e.g. Xero orgs that number on approval).
  externalInvoiceNumber?: string;
  // Provider vocabulary, verbatim.
  externalInvoiceStatus?: string;
  raw: unknown;
}

// Lifecycle of an invoice in the accounting system — mirrors the Prisma
// AccountingInvoiceState enum (this file stays Prisma-free).
export type AccountingInvoiceStateValue =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'VOIDED'
  | 'DELETED';

// The status/payment facts of one invoice, as the accounting system (the
// system of record for invoices and payments, ADR-006) reports them. Amounts
// are the provider's own: amountDue already nets off payments, credit notes,
// overpayments and prepayments. Decimal strings, same convention as prices.
export interface AccountingExternalInvoiceStatus {
  externalInvoiceId: string;
  externalInvoiceNumber?: string;
  state: AccountingInvoiceStateValue;
  // Provider vocabulary, verbatim (for AccountingInvoiceExport.externalInvoiceStatus).
  rawStatus: string;
  currency?: string;
  total: string;
  amountPaid: string;
  amountCredited: string;
  amountDue: string;
  // Calendar dates (YYYY-MM-DD) in the accounting organisation's calendar.
  issueDate: string | null;
  dueDate: string | null;
  fullyPaidOn: string | null;
  // When the provider last changed the invoice (UTC instant).
  providerUpdatedAt: Date | null;
}

// One page of a record-type pull. `nextCursor` is opaque to every caller: the
// adapter decides what it encodes (Xero: a modified-since timestamp; another
// provider might use a sync token) and the framework only stores it on the
// IngestionRun and hands it back on the next pull. null means "no incremental
// position available — next pull must be full".
export interface AccountingFetchResult<T> {
  records: T[];
  nextCursor: string | null;
}

// The port. One implementation per provider (XeroAccountingAdapter is the
// first); the framework only ever talks to this interface. Every method must
// meet the obligations in the header above. Provider names appear in the
// comments below only as examples of why a method is shaped the way it is.
export interface AccountingConnectionAdapter {
  // The provider's name as people know it ("Xero"), for every user-facing
  // sentence that names the provider — never the enum value.
  readonly displayName: string;
  buildAuthorizationUrl(state: string): Promise<string>;
  // callbackUrl is the full request URL (incl. querystring) the provider
  // redirected the browser to — some provider SDKs (xero-node included)
  // validate the state themselves from it, in addition to our own check.
  exchangeCodeForToken(callbackUrl: string, expectedState: string): Promise<AccountingTokenSet>;
  listAvailableOrganisations(tokenSet: AccountingTokenSet): Promise<AccountingExternalOrganisation[]>;
  // Failures should be thrown as AccountingProviderError so callers can
  // distinguish transient (retryable) from permanent (user-actionable, e.g.
  // a revoked/already-consumed refresh token) causes — same contract as
  // createInvoice below.
  refreshAccessToken(tokenSet: AccountingTokenSet): Promise<AccountingTokenSet>;
  // Incremental fetch contract (see AccountingFetchResult): a null/absent
  // cursor means a full fetch; otherwise the adapter returns only records
  // changed since the position the cursor encodes. An adapter that can't
  // fetch incrementally ignores the cursor, returns everything and a null
  // nextCursor — the caller handles either.
  listContacts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    cursor?: string | null,
  ): Promise<AccountingFetchResult<AccountingExternalContact>>;
  listProducts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    cursor?: string | null,
  ): Promise<AccountingFetchResult<AccountingExternalProduct>>;
  // No modifiedSince — Xero's tax rates have no per-record modified
  // timestamp to filter on (unlike contacts/products), so every sync is a
  // full fetch.
  listTaxRates(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
  ): Promise<AccountingExternalTaxRate[]>;
  // Whether the scopes granted at consent time (AccountingConnection.scopes,
  // space-separated) permit invoice creation. Scope vocabulary is
  // provider-specific, so the judgement lives here — callers use this to fail
  // fast with a "reconnect" message instead of a provider 403 (some providers,
  // Xero included, cannot expand scopes without a fresh consent).
  hasInvoiceCreationScope(grantedScopes: string): boolean;
  // Whether the granted scopes permit reading invoice status/payments (the
  // invoice status sync checks this before calling listInvoiceStatuses).
  hasInvoiceReadScope(grantedScopes: string): boolean;
  // Status and payment facts for the invoices this application created —
  // never other invoices in the organisation. Same cursor contract as
  // listContacts: null = every such invoice (the full reconcile), otherwise
  // only those changed since the cursor's position.
  listInvoiceStatuses(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    cursor?: string | null,
  ): Promise<AccountingFetchResult<AccountingExternalInvoiceStatus>>;
  // The live sales invoice THIS APPLICATION created with the given reference
  // (the Stocdup order number, unique across Stocdup), or null when there is
  // none. "Live" excludes voided and deleted invoices: after a distributor
  // voids an invoice, exporting the order again is a deliberate new invoice.
  // This is the duplicate-invoice guard (ADR-073): the export calls it before
  // every createInvoice, so it must reflect what the provider actually holds —
  // no caching, and never "null" for "could not tell" (throw instead).
  findInvoiceByReference(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    reference: string,
  ): Promise<AccountingInvoiceResult | null>;
  // Creates one sales invoice, carrying request.reference so
  // findInvoiceByReference can find it again. idempotencyKey is a second,
  // short-lived safety net only — the same key is replayed while the request
  // is unchanged, so a provider that honours it will not act twice on a call
  // still in flight. It is NOT the duplicate guard: providers forget keys
  // (Xero after 6 minutes). Failures are thrown as AccountingProviderError,
  // classified transient/permanent, with `outcomeUnknown` set whenever the
  // provider may have created the invoice despite the failure.
  createInvoice(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    request: AccountingInvoiceRequest,
    idempotencyKey: string,
  ): Promise<AccountingInvoiceResult>;
}
