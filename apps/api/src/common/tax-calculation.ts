import { Prisma } from '@prisma/client';

/**
 * Net/tax/gross for one order line. Tax is rounded to 2dp once, here — order
 * totals must sum these already-rounded amounts, never re-round after
 * summing. Shared by CartService (rate resolved and frozen at cart-add time)
 * and OrdersService (submitOrder carries that frozen rate through unchanged)
 * so the two can't compute tax differently.
 */
export function calculateLineTax(
  quantity: number,
  unitPrice: Prisma.Decimal,
  taxRatePercentage: Prisma.Decimal | null,
): { netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; grossAmount: Prisma.Decimal } {
  const netAmount = unitPrice.mul(quantity);
  const taxAmount = taxRatePercentage
    ? netAmount.mul(taxRatePercentage).div(100).toDecimalPlaces(2)
    : new Prisma.Decimal(0);
  const grossAmount = netAmount.plus(taxAmount);
  return { netAmount, taxAmount, grossAmount };
}

/**
 * The label a cart/order summary should use for its aggregate tax row: the
 * real tax type name when every line agrees on one, otherwise the generic
 * 'Tax' fallback. Shared by CartService and OrdersService so a mixed-tax-type
 * cart/order never shows a name that only some of its lines actually have.
 */
export function resolveTaxLabel(lines: Array<{ taxTypeName: string | null }>): string {
  const names = new Set(lines.map((line) => line.taxTypeName));
  if (names.size === 1) {
    const [name] = names;
    if (name) return name;
  }
  return 'Tax';
}
