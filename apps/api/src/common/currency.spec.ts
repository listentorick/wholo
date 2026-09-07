import { Prisma } from '@prisma/client';
import { currencyMinorUnitExponent, toMinorUnits } from './currency';

describe('currencyMinorUnitExponent', () => {
  it('returns 2 for the common two-decimal currencies', () => {
    expect(currencyMinorUnitExponent('GBP')).toBe(2);
    expect(currencyMinorUnitExponent('USD')).toBe(2);
    expect(currencyMinorUnitExponent('EUR')).toBe(2);
  });

  it('returns 0 for a zero-decimal currency', () => {
    expect(currencyMinorUnitExponent('JPY')).toBe(0);
  });

  it('returns 3 for a three-decimal currency', () => {
    expect(currencyMinorUnitExponent('BHD')).toBe(3);
  });

  it('falls back to 2 for an unrecognised code', () => {
    expect(currencyMinorUnitExponent('XXX')).toBe(2);
    expect(currencyMinorUnitExponent('not-a-currency')).toBe(2);
  });
});

describe('toMinorUnits', () => {
  it('converts a GBP amount to pence', () => {
    expect(toMinorUnits(new Prisma.Decimal('127.50'), 'GBP')).toBe(12750);
    expect(toMinorUnits(new Prisma.Decimal('10.00'), 'GBP')).toBe(1000);
  });

  it('returns 0 for a zero amount', () => {
    expect(toMinorUnits(new Prisma.Decimal('0'), 'GBP')).toBe(0);
  });

  it('does not scale a zero-decimal currency', () => {
    expect(toMinorUnits(new Prisma.Decimal('1250'), 'JPY')).toBe(1250);
  });

  it('rounds half-up at the minor unit', () => {
    expect(toMinorUnits(new Prisma.Decimal('1.005'), 'GBP')).toBe(101);
    expect(toMinorUnits(new Prisma.Decimal('1.004'), 'GBP')).toBe(100);
  });

  it('accepts a string or number amount', () => {
    expect(toMinorUnits('24.46', 'GBP')).toBe(2446);
    expect(toMinorUnits(24.46, 'GBP')).toBe(2446);
  });
});
