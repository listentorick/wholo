import { distributorLocalDate } from './distributor-local-date';

describe('distributorLocalDate', () => {
  it('returns the same UTC calendar day for a UTC timezone', () => {
    const result = distributorLocalDate(new Date('2026-03-15T10:00:00.000Z'), 'UTC');
    expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('rolls back to the previous day west of UTC around midnight', () => {
    // 02:00 UTC is still 21:00 the previous day in New York (UTC-5 in March, pre-DST).
    const result = distributorLocalDate(new Date('2026-03-08T02:00:00.000Z'), 'America/New_York');
    expect(result.toISOString()).toBe('2026-03-07T00:00:00.000Z');
  });

  it('rolls forward to the next day east of UTC around midnight', () => {
    // 22:00 UTC is already 09:00 the next day in Sydney (UTC+11 in January, DST).
    const result = distributorLocalDate(new Date('2026-01-14T22:00:00.000Z'), 'Australia/Sydney');
    expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('handles a daylight-saving transition correctly', () => {
    // UK clocks went forward on 2026-03-29; 00:30 UTC is still 00:30 GMT (pre-transition).
    const beforeTransition = distributorLocalDate(new Date('2026-03-29T00:30:00.000Z'), 'Europe/London');
    expect(beforeTransition.toISOString()).toBe('2026-03-29T00:00:00.000Z');

    // 23:30 UTC that same day is 00:30 BST the next calendar day (post-transition).
    const afterTransition = distributorLocalDate(new Date('2026-03-29T23:30:00.000Z'), 'Europe/London');
    expect(afterTransition.toISOString()).toBe('2026-03-30T00:00:00.000Z');
  });
});
