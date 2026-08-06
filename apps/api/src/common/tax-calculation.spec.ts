import { Prisma } from '@prisma/client';
import { calculateLineTax, resolveTaxLabel } from './tax-calculation';

describe('calculateLineTax', () => {
  it('computes net/tax/gross for a standard-rate line (AC5: £10 x 2 @ 20%)', () => {
    const result = calculateLineTax(2, new Prisma.Decimal('10.00'), new Prisma.Decimal('20.00'));
    expect(result.netAmount.toFixed(2)).toBe('20.00');
    expect(result.taxAmount.toFixed(2)).toBe('4.00');
    expect(result.grossAmount.toFixed(2)).toBe('24.00');
  });

  it('produces £0 tax for a zero-rated line while net/gross still reflect the price (AC6)', () => {
    const result = calculateLineTax(3, new Prisma.Decimal('5.00'), new Prisma.Decimal('0.00'));
    expect(result.netAmount.toFixed(2)).toBe('15.00');
    expect(result.taxAmount.toFixed(2)).toBe('0.00');
    expect(result.grossAmount.toFixed(2)).toBe('15.00');
  });

  it('produces £0 tax when no rate is available (null), rather than throwing', () => {
    const result = calculateLineTax(1, new Prisma.Decimal('9.99'), null);
    expect(result.taxAmount.toFixed(2)).toBe('0.00');
    expect(result.grossAmount.toFixed(2)).toBe('9.99');
  });

  it('rounds the tax amount half-up to 2dp', () => {
    // net = 0.05, rate = 50% -> raw tax = 0.025 -> rounds to 0.03, not 0.02
    const result = calculateLineTax(1, new Prisma.Decimal('0.05'), new Prisma.Decimal('50'));
    expect(result.taxAmount.toFixed(2)).toBe('0.03');
    expect(result.grossAmount.toFixed(2)).toBe('0.08');
  });

  it('multiplies unit price by quantity for the net amount', () => {
    const result = calculateLineTax(7, new Prisma.Decimal('3.33'), new Prisma.Decimal('20'));
    expect(result.netAmount.toFixed(2)).toBe('23.31');
  });
});

describe('resolveTaxLabel', () => {
  it('returns the shared tax type name when every line agrees', () => {
    expect(resolveTaxLabel([{ taxTypeName: 'VAT' }, { taxTypeName: 'VAT' }])).toBe('VAT');
  });

  it('returns the generic "Tax" label when lines have different tax type names', () => {
    expect(resolveTaxLabel([{ taxTypeName: 'VAT' }, { taxTypeName: 'GST' }])).toBe('Tax');
  });

  it('returns the generic "Tax" label when every line has a null tax type name', () => {
    expect(resolveTaxLabel([{ taxTypeName: null }, { taxTypeName: null }])).toBe('Tax');
  });

  it('returns the generic "Tax" label when some but not all lines have a null tax type name', () => {
    expect(resolveTaxLabel([{ taxTypeName: 'VAT' }, { taxTypeName: null }])).toBe('Tax');
  });

  it('returns the generic "Tax" label for an empty line list', () => {
    expect(resolveTaxLabel([])).toBe('Tax');
  });

  it('returns the single line\'s tax type name for a one-line cart/order', () => {
    expect(resolveTaxLabel([{ taxTypeName: 'Zero-rated' }])).toBe('Zero-rated');
  });
});
