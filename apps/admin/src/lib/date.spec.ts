import { describe, it, expect } from 'vitest';
import { toIso } from './date';

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
