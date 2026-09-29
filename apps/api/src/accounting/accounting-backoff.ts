import { AccountingProviderError } from './adapters/accounting-provider.error';

// BullMQ backoff type for every queue that calls an accounting provider
// (worker.module.ts registrations + each processor's `settings`). BullMQ
// routes any non-built-in `backoff.type` to the worker's backoffStrategy.
export const ACCOUNTING_BACKOFF_TYPE = 'accounting';

// Same curve the queues used before (exponential from 30 s): the usual
// transient cause is a provider rate limit, not a blip.
const BASE_DELAY_MS = 30_000;
const RETRY_AFTER_JITTER_MS = 5_000;

// When the provider told us how long to wait (Retry-After on a 429, or our
// own call budget), wait exactly that plus a little jitter so a batch of jobs
// rate-limited together doesn't come back in lockstep; otherwise back off
// exponentially.
export function computeAccountingBackoff(attemptsMade: number, err?: Error, random: () => number = Math.random): number {
  const retryAfterMs = err instanceof AccountingProviderError ? err.retryAfterMs : undefined;
  if (retryAfterMs !== undefined && retryAfterMs >= 0) {
    return retryAfterMs + Math.floor(random() * RETRY_AFTER_JITTER_MS);
  }
  return BASE_DELAY_MS * 2 ** Math.max(0, attemptsMade - 1);
}

// BullMQ's BackoffStrategy signature: (attemptsMade, type, err, job).
export function accountingBackoffStrategy(attemptsMade: number, _type?: string, err?: Error): number {
  return computeAccountingBackoff(attemptsMade, err);
}

// Spread into @Processor options: `@Processor(QUEUE, { ...ACCOUNTING_WORKER_SETTINGS })`.
export const ACCOUNTING_WORKER_SETTINGS = { settings: { backoffStrategy: accountingBackoffStrategy } };
