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

// Connection-lifecycle only for Phase 1. This interface will grow in
// Phases 2-4 (listContacts, listProducts, createInvoice, getInvoicePdf) —
// not built now, deliberately.
export interface AccountingConnectionAdapter {
  buildAuthorizationUrl(state: string): Promise<string>;
  // callbackUrl is the full request URL (incl. querystring) the provider
  // redirected the browser to — some provider SDKs (xero-node included)
  // validate the state themselves from it, in addition to our own check.
  exchangeCodeForToken(callbackUrl: string, expectedState: string): Promise<AccountingTokenSet>;
  listAvailableOrganisations(tokenSet: AccountingTokenSet): Promise<AccountingExternalOrganisation[]>;
  refreshAccessToken(tokenSet: AccountingTokenSet): Promise<AccountingTokenSet>;
}
