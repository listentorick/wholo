'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatMoney, type CustomerOpenInvoice, type OrderSummary } from '@wholo/types';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { PaymentBadge } from '@/components/orders/PaymentBadge';
import { plural, shortDate } from './customer-account';

type Tab = 'orders' | 'invoices';

interface Props {
  orders: OrderSummary[] | null;
  ordersError: string | null;
  invoices: CustomerOpenInvoice[];
}

const th = 'whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-xs font-semibold text-muted first:pl-4 last:pr-4 sm:px-4 sm:first:pl-5 sm:last:pr-5';
const td = 'whitespace-nowrap border-b border-border px-3 py-3 text-sm text-text first:pl-4 last:pr-4 sm:px-4 sm:first:pl-5 sm:last:pr-5';
// Secondary columns drop out on a phone so the table fits without scrolling.
const wide = 'hidden sm:table-cell';

// The customer's latest orders and every unpaid invoice, one tab each.
export function AccountActivityCard({ orders, ordersError, invoices }: Props) {
  const [tab, setTab] = useState<Tab>('orders');
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'orders', label: 'Recent orders' },
    { key: 'invoices', label: `Unpaid invoices · ${invoices.length}` },
  ];

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-white" aria-label="Orders and invoices">
      <div className="flex flex-wrap items-end justify-between gap-x-4 border-b border-border px-5 pt-3">
        <div role="tablist" aria-label="Orders and invoices" className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`account-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`account-panel-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`-mb-px min-h-11 border-b-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`account-panel-${tab}`} aria-labelledby={`account-tab-${tab}`} className="overflow-x-auto">
        {tab === 'orders' ? (
          ordersError && !orders ? (
            <p className="px-5 py-4 text-sm text-red-700">{ordersError}</p>
          ) : !orders ? (
            <p className="px-5 py-4 text-sm text-muted">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No orders yet.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Order</th>
                  <th className={`${th} ${wide}`}>Date</th>
                  <th className={th}>Status</th>
                  <th className={`${th} ${wide}`}>Payment</th>
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#fafafa] [&:last-child>td]:border-0">
                    <td className={td}>
                      <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                        {order.orderNumber}
                      </Link>
                      <span className="block text-xs text-muted sm:hidden">{shortDate(order.submittedAt ?? order.createdAt)}</span>
                    </td>
                    <td className={`${td} ${wide} text-muted`}>{shortDate(order.submittedAt ?? order.createdAt)}</td>
                    <td className={td}>
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className={`${td} ${wide}`}>
                      <PaymentBadge payment={order.invoiceSummary?.payment} />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{formatMoney(order.totalAmount, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : invoices.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No unpaid invoices.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Invoice</th>
                <th className={`${th} ${wide}`}>Order</th>
                <th className={th}>Due</th>
                <th className={`${th} text-right`}>Amount due</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.orderId} className="hover:bg-[#fafafa] [&:last-child>td]:border-0">
                  <td className={`${td} font-medium`}>{invoice.externalInvoiceNumber ?? '—'}</td>
                  <td className={`${td} ${wide}`}>
                    <Link href={`/orders/${invoice.orderId}`} className="text-primary hover:underline">
                      {invoice.orderNumber}
                    </Link>
                  </td>
                  <td className={td}>
                    {invoice.isOverdue ? (
                      <span className="font-medium text-red-700">{plural(invoice.daysOverdue, 'day')} overdue</span>
                    ) : (
                      <span className="text-muted">{invoice.dueDate ? `Due ${shortDate(invoice.dueDate)}` : 'No due date'}</span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(invoice.amountDue.toFixed(2), invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
