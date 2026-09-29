import { AccountingInvoiceState } from '@prisma/client';

// Outbox event written whenever an invoice's derived payment status changes
// (AccountingInvoiceSyncProcessor); consumed by the invoice facts (ADR-072).
export const INVOICE_PAYMENT_STATUS_CHANGED = 'InvoicePaymentStatusChanged';

// How paid an order's invoice is, derived from the synced accounting state.
// One definition used everywhere (order read models, facts, stats). Payment
// status is derived, never stored: "overdue" depends on today's date, and the
// accounting system stays the system of record (ADR-006).
//   NOT_SYNCED — no invoice yet, or the status sync hasn't seen it yet
//   UNPAID     — nothing paid or credited yet (includes invoices still in draft
//                or awaiting approval in the accounting system)
//   PART_PAID  — something paid/credited, something still due
//   PAID       — nothing left to pay
//   VOID       — voided or deleted in the accounting system
export type InvoicePaymentStatus = 'NOT_SYNCED' | 'UNPAID' | 'PART_PAID' | 'PAID' | 'VOID';

// Decimal-ish values as Prisma returns them (Decimal) or as strings/numbers.
type Amount = { toString(): string } | string | number | null | undefined;

export interface InvoicePaymentFacts {
  invoiceState: AccountingInvoiceState | null;
  invoiceTotal?: Amount;
  amountPaid?: Amount;
  amountCredited?: Amount;
  amountDue?: Amount;
  dueDate?: Date | null;
}

function toNumber(value: Amount): number {
  if (value == null) return 0;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

export function derivePaymentStatus(facts: InvoicePaymentFacts): InvoicePaymentStatus {
  const state = facts.invoiceState;
  if (!state) return 'NOT_SYNCED';
  if (state === AccountingInvoiceState.VOIDED || state === AccountingInvoiceState.DELETED) return 'VOID';
  if (state === AccountingInvoiceState.PAID) return 'PAID';

  const due = toNumber(facts.amountDue);
  const settled = toNumber(facts.amountPaid) + toNumber(facts.amountCredited);
  if (state === AccountingInvoiceState.AWAITING_PAYMENT && due <= 0 && toNumber(facts.invoiceTotal) > 0) return 'PAID';
  if (settled > 0 && due > 0) return 'PART_PAID';
  return 'UNPAID';
}

// Overdue = approved, money still due, and the due date is before the
// distributor's local "today" (an invoice due today is not overdue until
// tomorrow). `today` is a YYYY-MM-DD calendar date.
export function isOverdue(facts: InvoicePaymentFacts, today: string): boolean {
  if (facts.invoiceState !== AccountingInvoiceState.AWAITING_PAYMENT) return false;
  if (toNumber(facts.amountDue) <= 0 || !facts.dueDate) return false;
  return facts.dueDate.toISOString().slice(0, 10) < today;
}

// States after which an invoice can't change payment-wise — the status sync
// stops asking about it.
export const SETTLED_INVOICE_STATES: AccountingInvoiceState[] = [
  AccountingInvoiceState.PAID,
  AccountingInvoiceState.VOIDED,
  AccountingInvoiceState.DELETED,
];
