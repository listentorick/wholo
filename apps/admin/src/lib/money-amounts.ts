import type { MoneyAmount } from '@wholo/types';

// Per-currency totals as one line of text, e.g. "£1,200.00 + €80.00". Amounts
// are never added across currencies; with nothing to total, it's zero in the
// distributor's own currency rather than an assumed one.
export function formatAmounts(
  amounts: MoneyAmount[],
  fallbackCurrency: string,
  format: (amount: number, currency: string) => string,
): string {
  if (amounts.length === 0) return format(0, fallbackCurrency);
  return amounts.map((a) => format(a.amount, a.currency)).join(' + ');
}
