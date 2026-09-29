import type { OrderInvoicePayment, InvoicePaymentStatus } from '@wholo/types';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';

// Payment position of an order's invoice, as synced back from the accounting
// system (ADR-072). One config drives every place it is shown. Overdue is
// shown instead of Unpaid / Part paid; the label always carries the meaning,
// never the colour alone.
const PAYMENT_META: Record<Exclude<InvoicePaymentStatus, 'NOT_SYNCED'>, { label: string; tone: StatusTone }> = {
  UNPAID: { label: 'Unpaid', tone: 'yellow' },
  PART_PAID: { label: 'Part paid', tone: 'blue' },
  PAID: { label: 'Paid', tone: 'green' },
  VOID: { label: 'Void', tone: 'gray' },
};
const OVERDUE = { label: 'Overdue', tone: 'red' as const };

export function paymentLabel(payment: OrderInvoicePayment | null | undefined): { label: string; tone: StatusTone } | null {
  if (!payment || payment.paymentStatus === 'NOT_SYNCED') return null;
  if (payment.isOverdue) return OVERDUE;
  return PAYMENT_META[payment.paymentStatus];
}

// Renders nothing until the invoice exists in the accounting system and has
// been synced — "no badge" rather than a guess.
export function PaymentBadge({ payment }: { payment: OrderInvoicePayment | null | undefined }) {
  const meta = paymentLabel(payment);
  return meta ? <StatusBadge label={meta.label} tone={meta.tone} /> : null;
}
