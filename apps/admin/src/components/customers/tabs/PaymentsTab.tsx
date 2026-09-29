'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminCustomerPaymentsApi } from '@wholo/admin-api-client';
import { formatMoney, type Customer, type CustomerPaymentSummary } from '@wholo/types';
import { PaymentBadge } from '@/components/orders/PaymentBadge';

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{value}</p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  );
}

// A customer's payment position with this distributor (ADR-072): what they
// owe now, what is overdue, and how promptly they have paid over the last 90
// days. Read-only — payments are recorded in the accounting system.
export function PaymentsTab({ customer }: { customer: Customer }) {
  const [summary, setSummary] = useState<CustomerPaymentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    adminCustomerPaymentsApi
      .get(customer.organisationId, controller.signal)
      .then(setSummary)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load payments');
      });
    return () => controller.abort();
  }, [customer.organisationId]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!summary) return <p className="text-sm text-muted">Loading payments…</p>;

  const currency = summary.openInvoices[0]?.currency ?? 'GBP';
  const { outstanding, overdue, last90Days } = summary;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Outstanding"
          value={formatMoney(outstanding.amount.toFixed(2), currency)}
          detail={`${outstanding.count} unpaid invoice${outstanding.count === 1 ? '' : 's'}`}
        />
        <Stat
          label="Overdue"
          value={formatMoney(overdue.amount.toFixed(2), currency)}
          detail={
            overdue.count === 0
              ? 'Nothing overdue'
              : `${overdue.count} invoice${overdue.count === 1 ? '' : 's'}, oldest ${overdue.oldestDaysOverdue} days late`
          }
        />
        <Stat
          label="Average days to pay"
          value={last90Days.averageDaysToPay === null ? '—' : `${last90Days.averageDaysToPay}`}
          detail="Invoice date to paid in full, last 90 days"
        />
        <Stat
          label="Paid on time"
          value={last90Days.paidOnTimePercent === null ? '—' : `${last90Days.paidOnTimePercent}%`}
          detail={`Of ${last90Days.paidCount} invoice${last90Days.paidCount === 1 ? '' : 's'} paid in the last 90 days`}
        />
      </div>

      <div className="rounded-lg border border-border bg-white">
        <p className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Unpaid invoices
        </p>
        {summary.openInvoices.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No unpaid invoices.</p>
        ) : (
          <ul className="divide-y divide-border">
            {summary.openInvoices.map((invoice) => (
              <li key={invoice.orderId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/orders/${invoice.orderId}`} className="text-sm font-medium text-text hover:text-primary">
                    {invoice.externalInvoiceNumber ?? invoice.orderNumber}
                  </Link>
                  <p className="text-xs text-muted">
                    Order {invoice.orderNumber} · due {fmtDate(invoice.dueDate)}
                    {invoice.isOverdue ? ` · ${invoice.daysOverdue} days late` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text">{formatMoney(invoice.amountDue.toFixed(2), invoice.currency)}</span>
                  <PaymentBadge
                    payment={{
                      paymentStatus: invoice.paymentStatus,
                      isOverdue: invoice.isOverdue,
                      externalInvoiceNumber: invoice.externalInvoiceNumber,
                      total: invoice.total,
                      amountPaid: invoice.total - invoice.amountDue,
                      amountDue: invoice.amountDue,
                      dueDate: invoice.dueDate,
                      fullyPaidOn: null,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
