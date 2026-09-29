import { parseRetryAfterMs, parseXeroSdkError, readRateLimitHeaders } from './xero-errors';

describe('parseXeroSdkError', () => {
  it('reads the JSON-string rejection xero-node 18.1.0 produces for an HTTP error', () => {
    const rejection = JSON.stringify({
      response: {
        statusCode: 400,
        body: { Message: 'A validation exception occurred', Elements: [{ ValidationErrors: [{ Message: 'Bad account' }] }] },
        headers: { 'Xero-Correlation-Id': 'corr-9' },
      },
    });

    expect(parseXeroSdkError(rejection)).toEqual({
      statusCode: 400,
      validationMessages: ['Bad account'],
      xeroMessage: 'A validation exception occurred',
      retryAfterMs: undefined,
      correlationId: 'corr-9',
    });
  });

  it('treats statusCode 0 as a transport failure and keeps only the transport message', () => {
    const rejection = JSON.stringify({ response: { statusCode: 0, body: 'connect ETIMEDOUT', headers: {} }, body: 'connect ETIMEDOUT' });

    expect(parseXeroSdkError(rejection)).toEqual({ validationMessages: [], transportMessage: 'connect ETIMEDOUT' });
  });

  it('reads Retry-After in seconds', () => {
    const rejection = JSON.stringify({ response: { statusCode: 429, body: 'Rate limited', headers: { 'retry-after': '30' } } });

    expect(parseXeroSdkError(rejection).retryAfterMs).toBe(30_000);
  });

  it('uses the problem-details Detail for non-validation errors (e.g. 401)', () => {
    const rejection = JSON.stringify({
      response: { statusCode: 401, body: { Type: 'x', Title: 'Unauthorized', Detail: 'TokenExpired: token expired' } },
    });

    expect(parseXeroSdkError(rejection).xeroMessage).toBe('TokenExpired: token expired');
  });

  it('still understands an object rejection (older SDK shape)', () => {
    expect(parseXeroSdkError({ response: { statusCode: 503 } }).statusCode).toBe(503);
  });

  it('handles an unparseable string without throwing', () => {
    expect(parseXeroSdkError('not json at all')).toEqual({ validationMessages: [], transportMessage: 'no HTTP response' });
  });

  it('truncates very long provider text', () => {
    const rejection = JSON.stringify({ response: { statusCode: 400, body: { Message: 'x'.repeat(2000) } } });

    expect(parseXeroSdkError(rejection).xeroMessage!.length).toBeLessThanOrEqual(501);
  });
});

describe('parseRetryAfterMs', () => {
  it('accepts an HTTP date', () => {
    const now = Date.parse('2026-09-29T10:00:00Z');
    expect(parseRetryAfterMs('Tue, 29 Sep 2026 10:00:10 GMT', now)).toBe(10_000);
  });

  it('ignores garbage', () => {
    expect(parseRetryAfterMs('soon')).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
  });
});

describe('readRateLimitHeaders', () => {
  it('reads Xero rate-limit headers case-insensitively', () => {
    expect(
      readRateLimitHeaders({ 'X-MinLimit-Remaining': '58', 'x-daylimit-remaining': '4990', 'X-AppMinLimit-Remaining': '9999' }),
    ).toEqual({ minRemaining: 58, dayRemaining: 4990, appMinRemaining: 9999, correlationId: undefined });
  });
});
