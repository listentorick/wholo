/**
 * Format a monetary amount in the given ISO 4217 currency. `locale` is
 * intentionally optional and defaults to the runtime's own locale — the
 * currency code alone determines the symbol and decimal precision; only
 * grouping/placement conventions should follow the viewer's locale, not a
 * hardcoded one or the distributor's own currency.
 */
export function formatMoney(amount: string | number, currencyCode: string, locale?: string): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(value);
}

/** Bare currency symbol (e.g. "£"), for input adornments that don't want a full formatted amount. */
export function getCurrencySymbol(currencyCode: string, locale?: string): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currencyCode;
}
