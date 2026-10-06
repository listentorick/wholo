import type { AccountingProvider, PaymentTermType } from '@wholo/types';

const PROVIDER_LABELS: Record<string, string> = { XERO: 'Xero' };

export function accountingProviderLabel(provider: AccountingProvider | string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/**
 * The built-in payment term that leaves the due date to the accounting
 * integration (ADR-075), named after the one that is connected.
 */
export function integrationTermLabel(provider: AccountingProvider | string): string {
  return `${accountingProviderLabel(provider)} manages due date`;
}

/** A term's display name — the integration's own label for the built-in term. */
export function paymentTermLabel(
  term: { name: string; type: PaymentTermType },
  provider: AccountingProvider | string | null | undefined,
): string {
  return term.type === 'ACCOUNTING_SYSTEM_DEFAULT' && provider ? integrationTermLabel(provider) : term.name;
}
