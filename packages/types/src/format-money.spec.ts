import { describe, it, expect } from 'vitest';
import { formatMoney, getCurrencySymbol } from './format-money';

describe('formatMoney', () => {
  it('formats GBP with the £ symbol', () => {
    expect(formatMoney(19.99, 'GBP', 'en-GB')).toBe('£19.99');
  });

  it('formats USD with the $ symbol', () => {
    expect(formatMoney(19.99, 'USD', 'en-US')).toBe('$19.99');
  });

  it('formats EUR', () => {
    expect(formatMoney(19.99, 'EUR', 'en-IE')).toBe('€19.99');
  });

  it('accepts a decimal string amount, as returned by the API', () => {
    expect(formatMoney('42.50', 'GBP', 'en-GB')).toBe('£42.50');
  });

  it('formats zero', () => {
    expect(formatMoney(0, 'GBP', 'en-GB')).toBe('£0.00');
  });

  it('formats a negative amount', () => {
    expect(formatMoney(-5, 'GBP', 'en-GB')).toBe('-£5.00');
  });
});

describe('getCurrencySymbol', () => {
  it('returns the £ symbol for GBP', () => {
    expect(getCurrencySymbol('GBP', 'en-GB')).toBe('£');
  });

  it('returns the $ symbol for USD', () => {
    expect(getCurrencySymbol('USD', 'en-US')).toBe('$');
  });

  it('returns the € symbol for EUR', () => {
    expect(getCurrencySymbol('EUR', 'en-IE')).toBe('€');
  });
});
