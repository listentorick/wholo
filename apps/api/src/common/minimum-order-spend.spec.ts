import { Prisma } from '@prisma/client';
import { resolveEffectiveMinimumOrderSpend } from './minimum-order-spend';

describe('resolveEffectiveMinimumOrderSpend', () => {
  it('returns the relationship override when set, ignoring the distributor default', () => {
    const result = resolveEffectiveMinimumOrderSpend(
      new Prisma.Decimal('50.00'),
      new Prisma.Decimal('100.00'),
    );
    expect(result?.toString()).toBe('50');
  });

  it('falls back to the distributor default when the relationship has no override', () => {
    const result = resolveEffectiveMinimumOrderSpend(null, new Prisma.Decimal('100.00'));
    expect(result?.toString()).toBe('100');
  });

  it('returns null when neither is set', () => {
    expect(resolveEffectiveMinimumOrderSpend(null, null)).toBeNull();
    expect(resolveEffectiveMinimumOrderSpend(undefined, undefined)).toBeNull();
  });

  it('treats an explicit relationship override of £0 as a real minimum, not "no minimum"', () => {
    const result = resolveEffectiveMinimumOrderSpend(new Prisma.Decimal(0), new Prisma.Decimal('100.00'));
    expect(result?.toString()).toBe('0');
  });
});
