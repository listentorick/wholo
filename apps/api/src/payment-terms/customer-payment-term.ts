import { Prisma } from '@prisma/client';
import { describeRule } from './payment-terms.logic';

/** Select for a customer's payment-term override, under traderCustomerSettings. */
export const customerPaymentTermSelect = {
  paymentTermId: true,
  paymentTerm: { select: { id: true, name: true, type: true, days: true, dayOfWeek: true, dayOfMonth: true } },
} satisfies Prisma.TraderCustomerSettingsSelect;

type Settings = Prisma.TraderCustomerSettingsGetPayload<{ select: typeof customerPaymentTermSelect }>;

/**
 * The customer resource's payment-term fields. null means the customer is
 * on the distributor default (ADR-075).
 */
export function customerPaymentTermFields(settings: Settings | null | undefined) {
  const term = settings?.paymentTerm;
  return {
    paymentTermId: settings?.paymentTermId ?? null,
    paymentTerm: term ? { id: term.id, name: term.name, summary: describeRule(term) } : null,
  };
}
