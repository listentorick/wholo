// Framework contract for accounting record matching. Each synced record type
// (contacts, products, ...) supplies one implementation; the sync pipeline
// consumes them uniformly (see AccountingSyncProcessorBase).
//
// Matchers are pure and DB-free: they rank the candidate pool they are given
// and never decide anything on their own — every result is a suggestion for a
// human to confirm, regardless of confidence. Confirmed mappings are written
// exclusively by explicit user actions.

// TMethod is the domain's match-method enum (e.g.
// AccountingContactMatchMethod, AccountingProductMatchMethod).
export interface AccountingMatchResult<TMethod> {
  // The domain id of the matched Wholo candidate (a TradeRelationship id for
  // contacts, a Product id for products).
  candidateId: string;
  confidence: number;
  matchMethod: TMethod;
  matchReason: string;
}

export interface AccountingRecordMatcher<TRecord, TCandidate, TMethod> {
  findBestMatch(record: TRecord, candidates: TCandidate[]): AccountingMatchResult<TMethod> | null;
}
