import { resolvePeriod } from './period';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('resolvePeriod', () => {
  const now = new Date('2026-03-15T14:30:00.000Z'); // a Sunday

  it('today: compares today against yesterday', () => {
    const { current, comparison } = resolvePeriod('UTC', 'today', undefined, now);
    expect(iso(current.start)).toBe('2026-03-15');
    expect(iso(current.end)).toBe('2026-03-15');
    expect(iso(comparison!.start)).toBe('2026-03-14');
    expect(iso(comparison!.end)).toBe('2026-03-14');
  });

  it('week: Monday-start week-to-date, compared with the same elapsed span the prior week', () => {
    // 2026-03-15 is a Sunday; the week started Monday 2026-03-09.
    const { current, comparison } = resolvePeriod('UTC', 'week', undefined, now);
    expect(iso(current.start)).toBe('2026-03-09');
    expect(iso(current.end)).toBe('2026-03-15');
    expect(iso(comparison!.start)).toBe('2026-03-02');
    expect(iso(comparison!.end)).toBe('2026-03-08');
  });

  it('month: month-to-date, compared with the same elapsed span the prior month', () => {
    const { current, comparison } = resolvePeriod('UTC', 'month', undefined, now);
    expect(iso(current.start)).toBe('2026-03-01');
    expect(iso(current.end)).toBe('2026-03-15');
    expect(iso(comparison!.start)).toBe('2026-02-01');
    expect(iso(comparison!.end)).toBe('2026-02-15');
  });

  it('month: clamps the comparison day to a shorter previous month (Mar 31 -> Feb 28)', () => {
    const marchEnd = new Date('2026-03-31T12:00:00.000Z');
    const { comparison } = resolvePeriod('UTC', 'month', undefined, marchEnd);
    expect(iso(comparison!.end)).toBe('2026-02-28'); // 2026 is not a leap year
  });

  it('rolling7: last 7 days including today, compared with the preceding 7-day window', () => {
    const { current, comparison } = resolvePeriod('UTC', 'rolling7', undefined, now);
    expect(iso(current.start)).toBe('2026-03-09');
    expect(iso(current.end)).toBe('2026-03-15');
    expect(iso(comparison!.start)).toBe('2026-03-02');
    expect(iso(comparison!.end)).toBe('2026-03-08');
  });

  it('custom: a 10-day range compares against the preceding 10 days (AC-01)', () => {
    const { current, comparison } = resolvePeriod('UTC', 'custom', { start: '2026-03-06', end: '2026-03-15' });
    expect(iso(current.start)).toBe('2026-03-06');
    expect(iso(current.end)).toBe('2026-03-15');
    expect(iso(comparison!.start)).toBe('2026-02-24');
    expect(iso(comparison!.end)).toBe('2026-03-05');
  });

  it('custom: throws without a range', () => {
    expect(() => resolvePeriod('UTC', 'custom')).toThrow();
  });

  it('resolves "today" using the distributor timezone, not server-local time', () => {
    // 23:30 UTC on 2026-03-15 is already 2026-03-16 in Sydney (UTC+11 in March, DST).
    const lateUtc = new Date('2026-03-15T23:30:00.000Z');
    const { current } = resolvePeriod('Australia/Sydney', 'today', undefined, lateUtc);
    expect(iso(current.start)).toBe('2026-03-16');
  });
});
