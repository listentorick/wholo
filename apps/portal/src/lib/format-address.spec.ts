import { describe, expect, it } from 'vitest';
import { formatAddress } from './format-address';

describe('formatAddress', () => {
  it('joins all present parts with commas', () => {
    expect(
      formatAddress({
        line1: '1 Wine Lane',
        line2: 'Unit 2',
        city: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        country: 'Australia',
      }),
    ).toBe('1 Wine Lane, Unit 2, Melbourne, VIC, 3000, Australia');
  });

  it('skips blank parts', () => {
    expect(
      formatAddress({
        line1: '1 Wine Lane',
        line2: null,
        city: 'Melbourne',
        state: null,
        postcode: '3000',
        country: null,
      }),
    ).toBe('1 Wine Lane, Melbourne, 3000');
  });

  it('returns an empty string for null or undefined', () => {
    expect(formatAddress(null)).toBe('');
    expect(formatAddress(undefined)).toBe('');
  });

  it('returns an empty string when every part is null', () => {
    expect(
      formatAddress({ line1: null, line2: null, city: null, state: null, postcode: null, country: null }),
    ).toBe('');
  });
});
