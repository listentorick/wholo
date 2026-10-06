import { PaymentTermSource, PaymentTermType } from '@prisma/client';
import type { ResolvedPaymentTerm } from './payment-term-resolution.service';
import type { OrderPaymentTerms } from '@wholo/types';
import { describeRule, PaymentTermRule } from './payment-terms.logic';

const isoDate = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

interface SnapshotColumns {
  invoiceDate: Date | null;
  dueDate: Date | null;
  paymentTermIdSnapshot: string | null;
  paymentTermSnapshot: unknown;
  paymentTermSourceSnapshot: PaymentTermSource | null;
}

/** The order resource's frozen payment terms, or null before acceptance (ADR-075). */
export function snapshottedOrderPaymentTerms(order: SnapshotColumns): OrderPaymentTerms | null {
  if (!order.paymentTermSnapshot || !order.paymentTermSourceSnapshot) return null;
  const rule = order.paymentTermSnapshot as PaymentTermRule & { name: string; type: PaymentTermType };
  return {
    calculated: true,
    invoiceDate: isoDate(order.invoiceDate),
    dueDate: isoDate(order.dueDate),
    term: { id: order.paymentTermIdSnapshot, name: rule.name, type: rule.type, summary: describeRule(rule) },
    source: order.paymentTermSourceSnapshot,
    // Filled in by the order read model, which knows the integration.
    accountingProvider: null,
  };
}

/** What acceptance would freeze right now — no dates until it happens. */
export function pendingOrderPaymentTerms(term: ResolvedPaymentTerm, source: PaymentTermSource): OrderPaymentTerms {
  return {
    calculated: false,
    invoiceDate: null,
    dueDate: null,
    term: { id: term.id, name: term.name, type: term.type, summary: describeRule(term) },
    source,
    accountingProvider: null,
  };
}
