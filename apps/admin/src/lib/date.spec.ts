import { describe, it, expect } from 'vitest';
import {
  toIso, startOfWeek, addDays, formatDateRange,
} from './date';

describe('toIso', () => {
  it('formats a plain date as YYYY-MM-DD', () => {
    expect(toIso(new Date(2026, 7, 19))).toBe('2026-08-19');
  });

  it('pads single-digit months and days', () => {
    expect(toIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('formats the last day of a month correctly', () => {
    expect(toIso(new Date(2026, 1, 28))).toBe('2026-02-28');
  });

  it('formats the last day of a year correctly', () => {
    expect(toIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('uses local getters, not a UTC shift, near a DST boundary', () => {
    // UK clocks go back on the last Sunday of October — 2026-10-25.
    // A naive toISOString() call on a Date constructed from local
    // midnight can shift a day in either direction depending on the
    // runtime timezone; toIso must not do that.
    const dstDay = new Date(2026, 9, 25);
    expect(toIso(dstDay)).toBe('2026-10-25');
  });
});

describe('startOfWeek', () => {
  it('returns the same day when given a Monday', () => {
    expect(toIso(startOfWeek(new Date(2026, 7, 24)))).toBe('2026-08-24');
  });

  it('rolls back to Monday for a mid-week day', () => {
    expect(toIso(startOfWeek(new Date(2026, 7, 27)))).toBe('2026-08-24');
  });

  it('rolls back to the previous Monday for a Sunday', () => {
    expect(toIso(startOfWeek(new Date(2026, 7, 30)))).toBe('2026-08-24');
  });
});

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(toIso(addDays(new Date(2026, 7, 24), 3))).toBe('2026-08-27');
  });

  it('rolls over a month boundary', () => {
    expect(toIso(addDays(new Date(2026, 7, 29), 6))).toBe('2026-09-04');
  });

  it('supports negative offsets', () => {
    expect(toIso(addDays(new Date(2026, 7, 24), -7))).toBe('2026-08-17');
  });
});

describe('formatDateRange', () => {
  it('formats a week within a single month as "d–d Mon YYYY"', () => {
    expect(formatDateRange(new Date(2026, 7, 17), new Date(2026, 7, 23))).toBe('17–23 Aug 2026');
  });

  it('formats a week crossing a month boundary (same year)', () => {
    expect(formatDateRange(new Date(2026, 7, 31), new Date(2026, 8, 6))).toBe('31 Aug – 6 Sep 2026');
  });

  it('formats a week crossing a year boundary', () => {
    expect(formatDateRange(new Date(2026, 11, 29), new Date(2027, 0, 4))).toBe('29 Dec 2026 – 4 Jan 2027');
  });
});
