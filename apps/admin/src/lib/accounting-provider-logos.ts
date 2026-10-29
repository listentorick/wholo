import type { AccountingProvider } from '@wholo/types';

// The logo for each accounting provider, by the provider code the API returns
// on a connection. The same image the provider's card on Integrations ›
// Accounting shows. A provider without an entry falls back to a badge with
// the first letter of its name, so a new provider still renders correctly.
const PROVIDER_LOGOS: Partial<Record<AccountingProvider, string>> = {
  XERO: '/logos/xero.png',
};

export function accountingProviderLogo(provider: AccountingProvider): string | null {
  return PROVIDER_LOGOS[provider] ?? null;
}
