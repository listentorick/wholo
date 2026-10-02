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
//
// `details` carries provider-neutral facts about the failed HTTP exchange:
// the status code (for log fields / alerting) and, on a rate limit, how long
// the provider asked us to wait — the queue's backoff strategy honours it
// (see accounting-backoff.ts). `message` must already be safe to show to a
// distributor and to log: adapters never put raw provider responses in it.
//
// `outcomeUnknown` is set on a failed WRITE when the provider may have carried
// it out anyway: no response (timeout, dropped connection), a provider 5xx, or
// a success response we could not read. It is the opposite of "definitely not
// done" (validation, authorisation, rate limit, our own call budget). The
// caller must never repeat such a write blind — see ADR-073.
export interface AccountingProviderErrorDetails {
  statusCode?: number;
  retryAfterMs?: number;
  outcomeUnknown?: boolean;
}

export class AccountingProviderError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly cause?: unknown,
    readonly code?: string,
    readonly details: AccountingProviderErrorDetails = {},
  ) {
    super(message);
    this.name = 'AccountingProviderError';
  }

  get statusCode(): number | undefined {
    return this.details.statusCode;
  }

  get retryAfterMs(): number | undefined {
    return this.details.retryAfterMs;
  }

  get outcomeUnknown(): boolean {
    return this.details.outcomeUnknown === true;
  }
}
