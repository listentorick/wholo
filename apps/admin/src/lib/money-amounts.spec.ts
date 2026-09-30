import { describe, it, expect } from 'vitest';
import { formatAmounts } from './money-amounts';

const fmt = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

describe('formatAmounts', () => {
  it('shows a single-currency total as one amount', () => {
    expect(formatAmounts([{ currency: 'EUR', amount: 12.5 }], 'EUR', fmt)).toBe('EUR 12.50');
  });

  it('keeps each currency separate rather than adding them', () => {
    expect(formatAmounts([{ currency: 'EUR', amount: 40 }, { currency: 'GBP', amount: 100 }], 'GBP', fmt)).toBe(
      'EUR 40.00 + GBP 100.00',
    );
  });

  it("shows zero in the distributor's currency when there is nothing to total", () => {
    expect(formatAmounts([], 'EUR', fmt)).toBe('EUR 0.00');
  });
});
