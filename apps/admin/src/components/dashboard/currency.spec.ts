import { describe, it, expect } from 'vitest';
import { makeCurrencyFormatter } from './currency';

describe('makeCurrencyFormatter', () => {
  it('formats whole units with the currency symbol and thousands separators', () => {
    expect(makeCurrencyFormatter('GBP')(1300)).toBe('£1,300');
    expect(makeCurrencyFormatter('USD')(1300)).toBe('$1,300');
  });

  it('drops pence', () => {
    expect(makeCurrencyFormatter('GBP')(1299.6)).toBe('£1,300');
  });
});
