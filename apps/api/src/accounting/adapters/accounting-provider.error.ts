// Provider-neutral failure wrapper thrown by adapter side-effect methods
// (createInvoice, refreshAccessToken). `transient` is the adapter's judgement
// of retryability: network faults, rate limits and provider 5xx are
// transient (the caller may rethrow so the queue retries with backoff);
// validation and authorisation failures are permanent (retrying without
// user action would fail forever).
//
// `code`, when set, is the provider's own machine-readable error code (e.g.
// Xero's OAuth2 `invalid_grant`/`invalid_client`) — finer-grained than
// `transient`, for callers that need to distinguish *why* a permanent
// failure happened (e.g. "distributor must reconnect" vs "our application
// credentials are wrong") rather than just whether to retry.
export class AccountingProviderError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly cause?: unknown,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AccountingProviderError';
  }
}
