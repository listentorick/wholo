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

// Phase 1 (connection lifecycle) + Phase 2 (listContacts) + Phase 3
// (listProducts) + Phase 4 (createInvoice). Still has room to grow
// (getInvoicePdf) — not built now, deliberately.
export interface AccountingConnectionAdapter {
  buildAuthorizationUrl(state: string): Promise<string>;
  // callbackUrl is the full request URL (incl. querystring) the provider
  // redirected the browser to — some provider SDKs (xero-node included)
  // validate the state themselves from it, in addition to our own check.
  exchangeCodeForToken(callbackUrl: string, expectedState: string): Promise<AccountingTokenSet>;
  listAvailableOrganisations(tokenSet: AccountingTokenSet): Promise<AccountingExternalOrganisation[]>;
  refreshAccessToken(tokenSet: AccountingTokenSet): Promise<AccountingTokenSet>;
  // modifiedSince, when provided, asks the provider for an incremental diff
  // rather than a full list — providers that can't support it should ignore
  // it and return everything (the caller must be able to handle either).
  listContacts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    modifiedSince?: Date,
  ): Promise<AccountingExternalContact[]>;
  listProducts(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    modifiedSince?: Date,
  ): Promise<AccountingExternalProduct[]>;
  // Whether the scopes granted at consent time (AccountingConnection.scopes,
  // space-separated) permit invoice creation. Scope vocabulary is
  // provider-specific, so the judgement lives here — callers use this to fail
  // fast with a "reconnect" message instead of a provider 403 (some providers,
  // Xero included, cannot expand scopes without a fresh consent).
  hasInvoiceCreationScope(grantedScopes: string): boolean;
  // Creates one sales invoice. idempotencyKey makes provider-side retries
  // safe: replaying the same key must not create a second invoice (providers
  // without native support must implement an equivalent guard). Failures
  // should be thrown as AccountingProviderError so callers can distinguish
  // transient (retryable) from permanent (user-actionable) causes.
  createInvoice(
    tokenSet: AccountingTokenSet,
    externalOrganisationId: string,
    request: AccountingInvoiceRequest,
    idempotencyKey: string,
  ): Promise<AccountingInvoiceResult>;
}
