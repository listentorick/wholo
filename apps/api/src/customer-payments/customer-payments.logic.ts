import type { CustomerOpenInvoice, CustomerPaymentSummary, MoneyAmount } from '@wholo/types';
import { derivePaymentStatus, InvoicePaymentFacts, isOverdue } from '../accounting/invoice-payment-status';

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const money = (v: { toString(): string } | null | undefined) => (v == null ? 0 : Math.round(Number(v.toString()) * 100) / 100);

export interface OpenInvoiceRow extends InvoicePaymentFacts {
  orderId: string;
  externalInvoiceNumber: string | null;
  order: { orderNumber: string; currency: string };
}

export function toOpenInvoice(row: OpenInvoiceRow, today: string): CustomerOpenInvoice {
  const overdue = isOverdue(row, today);
  const daysOverdue =
    overdue && row.dueDate ? Math.round((Date.parse(`${today}T00:00:00Z`) - row.dueDate.getTime()) / DAY_MS) : 0;
  return {
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    externalInvoiceNumber: row.externalInvoiceNumber,
    currency: row.order.currency,
    total: money(row.invoiceTotal),
    amountDue: money(row.amountDue),
    dueDate: row.dueDate ? isoDate(row.dueDate) : null,
    paymentStatus: derivePaymentStatus(row),
    isOverdue: overdue,
    daysOverdue,
  };
}

export interface PaidInvoiceRow {
  issueDate: Date | null;
  dueDate: Date | null;
  fullyPaidOn: Date | null;
}

// How promptly a customer pays: mean days from invoice date to fully paid,
// and the share paid on or before the due date. Invoices without the dates a
// measure needs are left out of that measure only.
export function summarisePaid(rows: PaidInvoiceRow[]): CustomerPaymentSummary['last90Days'] {
  const paid = rows.filter((r) => r.fullyPaidOn);
  const withIssue = paid.filter((r) => r.issueDate);
  const withDue = paid.filter((r) => r.dueDate);
  const averageDaysToPay =
    withIssue.length === 0
      ? null
      : Math.round(
          (withIssue.reduce((sum, r) => sum + (r.fullyPaidOn!.getTime() - r.issueDate!.getTime()) / DAY_MS, 0) /
            withIssue.length) *
            10,
        ) / 10;
  const paidOnTimePercent =
    withDue.length === 0
      ? null
      : Math.round((withDue.filter((r) => r.fullyPaidOn!.getTime() <= r.dueDate!.getTime()).length / withDue.length) * 100);
  return { paidCount: paid.length, averageDaysToPay, paidOnTimePercent };
}

const round = (n: number) => Math.round(n * 100) / 100;

// What is still due, totalled per currency (never across currencies), in
// currency-code order so the result is stable.
export function sumDueByCurrency(invoices: Array<Pick<CustomerOpenInvoice, 'currency' | 'amountDue'>>): MoneyAmount[] {
  const totals = new Map<string, number>();
  for (const i of invoices) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.amountDue);
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: round(amount) }));
}

export function summariseOpen(invoices: CustomerOpenInvoice[]): Pick<CustomerPaymentSummary, 'outstanding' | 'overdue'> {
  const overdue = invoices.filter((i) => i.isOverdue);
  return {
    outstanding: { amounts: sumDueByCurrency(invoices), count: invoices.length },
    overdue: {
      amounts: sumDueByCurrency(overdue),
      count: overdue.length,
      oldestDaysOverdue: overdue.length === 0 ? null : Math.max(...overdue.map((i) => i.daysOverdue)),
    },
  };
}
