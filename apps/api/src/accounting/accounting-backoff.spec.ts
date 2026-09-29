import { accountingBackoffStrategy, computeAccountingBackoff } from './accounting-backoff';
import { AccountingProviderError } from './adapters/accounting-provider.error';

describe('accountingBackoffStrategy', () => {
  it('backs off exponentially from 30s when the provider gave no wait', () => {
    expect(accountingBackoffStrategy(1, 'accounting', new Error('x'))).toBe(30_000);
    expect(accountingBackoffStrategy(2, 'accounting', new Error('x'))).toBe(60_000);
    expect(accountingBackoffStrategy(3, 'accounting', new Error('x'))).toBe(120_000);
  });

  it("waits exactly as long as the provider's Retry-After asks, plus jitter", () => {
    const rateLimited = new AccountingProviderError('Xero rate limit', true, undefined, 'HTTP_429', {
      statusCode: 429,
      retryAfterMs: 7_000,
    });

    expect(computeAccountingBackoff(4, rateLimited, () => 0)).toBe(7_000);
    expect(computeAccountingBackoff(4, rateLimited, () => 0.999)).toBeLessThan(12_000);
  });

  it('falls back to exponential for a provider error without Retry-After', () => {
    const serverError = new AccountingProviderError('HTTP 503', true, undefined, 'HTTP_503', { statusCode: 503 });

    expect(accountingBackoffStrategy(2, 'accounting', serverError)).toBe(60_000);
  });
});
