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

// Phase 1 (connection lifecycle) + Phase 2 (listContacts). Still has room to
// grow in Phases 3-4 (listProducts, createInvoice, getInvoicePdf) — not
// built now, deliberately.
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
}
