// Provider-neutral failure wrapper thrown by adapter side-effect methods
// (createInvoice). `transient` is the adapter's judgement of retryability:
// network faults, rate limits and provider 5xx are transient (the caller may
// rethrow so the queue retries with backoff); validation and authorisation
// failures are permanent (retrying without user action would fail forever).
export class AccountingProviderError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AccountingProviderError';
  }
}
