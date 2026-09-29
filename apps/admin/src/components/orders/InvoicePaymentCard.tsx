import type { OrderInvoicePayment } from '@wholo/types';
import { formatMoney } from '@wholo/types';
import { PaymentBadge } from './PaymentBadge';

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// The order's invoice as the accounting system reports it (ADR-072): number,
// payment position, due date and what is still owed. Shown on the order
// detail once the invoice has been synced back.
export function InvoicePaymentCard({ payment, currency }: { payment: OrderInvoicePayment; currency: string }) {
  const rows: Array<[string, string]> = [
    ['Invoice', payment.externalInvoiceNumber ?? '—'],
    ['Total', formatMoney(payment.total.toFixed(2), currency)],
    ['Paid', formatMoney(payment.amountPaid.toFixed(2), currency)],
    ['Still due', formatMoney(payment.amountDue.toFixed(2), currency)],
    ['Due date', fmtDate(payment.dueDate)],
  ];
  if (payment.fullyPaidOn) rows.push(['Paid in full on', fmtDate(payment.fullyPaidOn)]);

  return (
    <div className="rounded-lg border border-border bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invoice &amp; payment</p>
        <PaymentBadge payment={payment} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-sm font-medium text-text">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
