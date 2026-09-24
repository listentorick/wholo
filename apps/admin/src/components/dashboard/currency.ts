import { getCurrencySymbol } from '@wholo/types';

/** Whole-unit currency formatting shared by the dashboards, e.g. `£1,300`. */
export function makeCurrencyFormatter(currencyCode: string) {
  return (value: number): string => `${getCurrencySymbol(currencyCode)}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
