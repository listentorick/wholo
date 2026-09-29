import type { OrderInvoiceSummary } from '@wholo/types';
import { formatMoney } from '@wholo/types';

function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export type InvoiceTone = 'neutral' | 'good' | 'warning' | 'bad';

// What a customer sees about an order's invoice (ADR-072). Once the invoice
// has been synced back from the distributor's accounting system, payment
// takes over from the export state: Paid / Part paid · £x due / Due 12 Oct /
// Overdue. The words always carry the meaning; tone is secondary.
export function invoiceLabel(summary: OrderInvoiceSummary | null | undefined, currency: string): { text: string; tone: InvoiceTone } {
  if (!summary) return { text: 'Not yet raised', tone: 'neutral' };
  const payment = summary.payment;
  if (summary.status === 'COMPLETED' && payment && payment.paymentStatus !== 'NOT_SYNCED') {
    const due = formatMoney(payment.amountDue.toFixed(2), currency);
    if (payment.paymentStatus === 'PAID') return { text: 'Paid', tone: 'good' };
    if (payment.paymentStatus === 'VOID') return { text: 'Invoice voided', tone: 'neutral' };
    if (payment.isOverdue) return { text: `Overdue · ${due} due`, tone: 'bad' };
    if (payment.paymentStatus === 'PART_PAID') return { text: `Part paid · ${due} due`, tone: 'warning' };
    return { text: payment.dueDate ? `Due ${fmtDay(payment.dueDate)}` : 'Unpaid', tone: 'neutral' };
  }
  switch (summary.status) {
    case 'COMPLETED':
      return { text: summary.externalInvoiceStatus ? `Raised (${summary.externalInvoiceStatus})` : 'Raised', tone: 'neutral' };
    case 'FAILED':
      return { text: 'Export failed', tone: 'neutral' };
    default:
      return { text: 'Raising invoice…', tone: 'neutral' };
  }
}

export const INVOICE_TONE_CLASS: Record<InvoiceTone, string> = {
  neutral: 'text-foreground-tertiary',
  good: 'text-success',
  warning: 'text-foreground',
  bad: 'text-error',
};
