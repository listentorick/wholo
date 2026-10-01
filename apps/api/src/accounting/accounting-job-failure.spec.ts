import { AccountingProviderError } from './adapters/accounting-provider.error';
import { classifyJobFailure, isLastAttempt } from './accounting-job-failure';

const job = (attemptsMade: number, attempts: number) => ({ attemptsMade, opts: { attempts } });

describe('isLastAttempt', () => {
  it('is true only when no further attempt will run', () => {
    expect(isLastAttempt(job(0, 3))).toBe(false);
    expect(isLastAttempt(job(1, 3))).toBe(false);
    expect(isLastAttempt(job(2, 3))).toBe(true);
    expect(isLastAttempt({ attemptsMade: 0, opts: {} })).toBe(true); // no retries configured
  });
});

describe('classifyJobFailure', () => {
  it('treats a permanent provider error as permanent', () => {
    const failure = classifyJobFailure(new AccountingProviderError('Account code 999 is not valid', false), job(0, 5));
    expect(failure).toMatchObject({ permanent: true, lastAttempt: false, budgetWait: false });
  });

  it('treats a transient provider error as retryable', () => {
    expect(classifyJobFailure(new AccountingProviderError('HTTP 503', true), job(0, 5))).toMatchObject({ permanent: false, budgetWait: false });
  });

  it('recognises our own call budget running out as a wait', () => {
    const err = new AccountingProviderError('budget exhausted', true, undefined, 'CALL_BUDGET_EXHAUSTED', { retryAfterMs: 5000 });
    expect(classifyJobFailure(err, job(1, 5))).toMatchObject({ permanent: false, budgetWait: true, lastAttempt: false });
  });

  it('treats an unexpected error (our bug) as transient, not permanent', () => {
    expect(classifyJobFailure(new Error('boom'), job(0, 3))).toEqual({
      providerError: null,
      permanent: false,
      lastAttempt: false,
      budgetWait: false,
    });
  });
});
