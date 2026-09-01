'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Hash, Calendar, Truck, FileText, Banknote, CircleDot } from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { ordersApi } from '@wholo/api-client';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { Eyebrow } from '@/components/Eyebrow';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { OrderStatus, formatMoney } from '@wholo/types';
import type { OrderSummary, OrderInvoiceSummary } from '@wholo/types';

const STATUS_FILTERS: { label: string; value: OrderStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'Awaiting confirmation', value: OrderStatus.SUBMITTED },
  { label: 'Accepted', value: OrderStatus.ACCEPTED },
  { label: 'Delivered', value: OrderStatus.DELIVERED },
  { label: 'Cancelled', value: OrderStatus.CANCELLED },
];

function invoiceStatusLabel(summary: OrderInvoiceSummary | null | undefined) {
  if (!summary) return 'Not yet raised';
  switch (summary.status) {
    case 'COMPLETED':
      return summary.externalInvoiceStatus ? `Raised (${summary.externalInvoiceStatus})` : 'Raised';
    case 'FAILED':
      return 'Export failed';
    default:
      return 'Raising invoice…';
  }
}

function invoiceStatusColor(summary: OrderInvoiceSummary | null | undefined) {
  if (!summary) return '#D1D5DB';
  switch (summary.status) {
    case 'COMPLETED':
      return 'hsl(var(--color-success))';
    case 'FAILED':
      return '#DC2626';
    default:
      return '#F59E0B';
  }
}

function InvoiceCell({ summary }: { summary: OrderInvoiceSummary | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-foreground-tertiary">
      <span
        style={{ width: 6, height: 6, borderRadius: 9999, background: invoiceStatusColor(summary), flexShrink: 0 }}
        aria-hidden="true"
      />
      {invoiceStatusLabel(summary)}
    </span>
  );
}

function Th({ icon, align = 'left', children }: { icon: React.ReactNode; align?: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <th
      className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF' }}
    >
      <span className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        {icon}
        {children}
      </span>
    </th>
  );
}

/** Fixed column proportions so the 6-col table always fits its container (no horizontal scroll). */
function OrdersColGroup() {
  return (
    <colgroup>
      <col className="w-[15%]" />
      <col className="w-[12%]" />
      <col className="w-[13%]" />
      <col className="w-[16%]" />
      <col className="w-[13%]" />
      <col className="w-[31%]" />
    </colgroup>
  );
}

function SkeletonTableRow() {
  return (
    <tr className="border-b border-border" style={{ opacity: 0.5 }}>
      <td className="px-3 py-3"><div className="h-[13px] w-24 rounded-sm bg-border" /></td>
      <td className="px-3 py-3"><div className="h-3 w-[72px] rounded-sm bg-canvas" /></td>
      <td className="px-3 py-3"><div className="h-3 w-[72px] rounded-sm bg-canvas" /></td>
      <td className="px-3 py-3"><div className="h-3 w-24 rounded-sm bg-canvas" /></td>
      <td className="px-3 py-3 text-right"><div className="ml-auto h-[13px] w-14 rounded-sm bg-border" /></td>
      <td className="px-3 py-3"><div className="h-4 w-16 rounded-sm bg-canvas" /></td>
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="border-b border-border px-4 py-4" style={{ opacity: 0.5 }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 h-[13px] w-24 rounded-sm bg-border" />
          <div className="mb-1 h-[11px] w-16 rounded-sm bg-canvas" />
          <div className="h-[11px] w-16 rounded-sm bg-canvas" />
        </div>
        <div className="text-right">
          <div className="mb-2 h-[13px] w-14 rounded-sm bg-border" />
          <div className="h-[11px] w-12 rounded-sm bg-canvas" />
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();
  const router = useRouter();

  const { user, accessToken, isLoading: authLoading, orderAsMode } = useRequireAuth(pathname ?? `/${distributorSlug}/orders`);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (cursor?: string) => {
    if (!accessToken) return;
    try {
      const res = await ordersApi.listOrders(
        {
          limit: 20,
          distributorSlug,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(cursor ? { cursor } : {}),
        },
        accessToken,
      );
      if (cursor) {
        setOrders((prev) => [...prev, ...res.data]);
      } else {
        setOrders(res.data);
      }
      setNextCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
      setTotal(res.pagination.total);
    } catch {
      setError('Failed to load orders');
    }
  }, [accessToken, distributorSlug, statusFilter]);

  useEffect(() => {
    if (authLoading || !accessToken) return;
    setLoading(true);
    setError(null);
    fetchOrders().finally(() => setLoading(false));
  }, [authLoading, accessToken, fetchOrders, orderAsMode]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchOrders(nextCursor);
    setLoadingMore(false);
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (authLoading) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (!user) return null;

  const filterActive = statusFilter !== null;

  return (
    <>
      <style>{`
        @keyframes ol-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ol-row { animation: ol-fade-up 0.32s ease both; cursor: pointer; transition: background 0.12s; }
        .ol-row:hover { background: hsl(var(--color-primary-subtle)); }
      `}</style>

      <PageShell width="full">
        <div className="flex flex-1 flex-col gap-4">
          <Eyebrow>Order history</Eyebrow>

          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.value;
                return (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setStatusFilter(f.value)}
                    className={
                      active
                        ? 'rounded-md border-[1.5px] border-accent bg-accent-subtle px-3.5 py-1.5 text-sm font-semibold text-accent'
                        : 'rounded-md border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:border-muted'
                    }
                  >
                    {f.label}
                  </button>
                );
              })}
              {!loading && !error && orders.length > 0 && (
                <span className="ml-auto text-xs text-muted">
                  Showing {orders.length} of {total}
                </span>
              )}
            </div>

            {loading ? (
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
                <div className="hidden xl:block">
                  <table className="w-full table-fixed border-collapse">
                    <OrdersColGroup />
                    <tbody>
                      {[0, 1, 2, 3].map((i) => <SkeletonTableRow key={i} />)}
                    </tbody>
                  </table>
                </div>
                <div className="xl:hidden">
                  {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-1 items-center justify-center px-6 py-20 text-center">
                <p className="text-xs text-foreground-tertiary">{error}</p>
              </div>
            ) : orders.length === 0 && filterActive ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-8 py-16 text-center shadow-sm">
                <p className="text-sm text-foreground">No orders match this filter</p>
                <button
                  type="button"
                  onClick={() => setStatusFilter(null)}
                  className="text-xs font-semibold uppercase tracking-[0.12em] text-accent transition-colors hover:text-primary-hover"
                >
                  Clear filter
                </button>
              </div>
            ) : orders.length === 0 ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-20 text-center"
                style={{ animation: 'ol-fade-up 0.4s ease both 0.1s' }}
              >
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-border text-border">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} className="h-6 w-6">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <line x1="8" y1="8" x2="16" y2="8" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                    <line x1="8" y1="16" x2="12" y2="16" />
                  </svg>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">No orders yet</p>
                  <p className="text-xs text-foreground-tertiary">Place your first order to get started</p>
                </div>
                <button
                  onClick={() => router.push(`/${distributorSlug}/products`)}
                  className="rounded-md border-[1.5px] border-primary px-7 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-accent-subtle"
                >
                  Start an Order
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
                  {/* Wide screens: real table */}
                  <div className="hidden xl:block">
                    <table className="w-full table-fixed border-collapse">
                      <OrdersColGroup />
                      <thead>
                        <tr className="border-b border-border bg-topbar-bg">
                          <Th icon={<Hash className="h-3.5 w-3.5" strokeWidth={1.5} />}>Order</Th>
                          <Th icon={<Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />}>Order Date</Th>
                          <Th icon={<Truck className="h-3.5 w-3.5" strokeWidth={1.5} />}>Delivery Date</Th>
                          <Th icon={<FileText className="h-3.5 w-3.5" strokeWidth={1.5} />}>Invoice</Th>
                          <Th icon={<Banknote className="h-3.5 w-3.5" strokeWidth={1.5} />} align="right">Amount</Th>
                          <Th icon={<CircleDot className="h-3.5 w-3.5" strokeWidth={1.5} />}>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order, i) => {
                          const delay = Math.min(0.06 + i * 0.04, 0.45);
                          return (
                            <tr
                              key={order.id}
                              className="ol-row border-b border-border last:border-b-0"
                              style={{ animationDelay: `${delay}s` }}
                              onClick={() => router.push(`/${distributorSlug}/orders/${order.id}`)}
                            >
                              <td className="truncate px-3 py-3 text-sm font-medium text-foreground">
                                {order.orderNumber}
                              </td>
                              <td className="px-3 py-3 text-xs text-foreground-tertiary">
                                {fmtDate(order.submittedAt ?? order.createdAt)}
                              </td>
                              <td className="px-3 py-3 text-xs text-foreground-tertiary">
                                {order.requestedDeliveryDate ? fmtDate(order.requestedDeliveryDate) : '—'}
                              </td>
                              <td className="px-3 py-3">
                                <InvoiceCell summary={order.invoiceSummary} />
                              </td>
                              <td className="px-3 py-3 text-right text-sm font-medium tabular-nums text-foreground">
                                {formatMoney(order.totalAmount, order.currency)}
                              </td>
                              <td className="px-3 py-3">
                                <OrderStatusBadge status={order.status} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Narrow screens: card list */}
                  <div className="xl:hidden">
                    {orders.map((order, i) => {
                      const delay = Math.min(0.06 + i * 0.04, 0.45);
                      return (
                        <div
                          key={order.id}
                          className="ol-row border-b border-border px-4 py-4 last:border-b-0"
                          style={{ animationDelay: `${delay}s` }}
                          onClick={() => router.push(`/${distributorSlug}/orders/${order.id}`)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="mb-1 text-sm font-medium text-foreground">{order.orderNumber}</p>
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1.5 text-xs text-foreground-tertiary">
                                  <Calendar className="h-3 w-3 flex-shrink-0" strokeWidth={1.5} />
                                  {fmtDate(order.submittedAt ?? order.createdAt)}
                                </span>
                                {order.requestedDeliveryDate && (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-foreground-tertiary">
                                    <Truck className="h-3 w-3 flex-shrink-0" strokeWidth={1.5} />
                                    {fmtDate(order.requestedDeliveryDate)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="mb-1.5 text-sm font-medium tabular-nums text-foreground">
                                {formatMoney(order.totalAmount, order.currency)}
                              </p>
                              <OrderStatusBadge status={order.status} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {hasMore && (
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="self-center rounded-md border border-border bg-transparent px-6 py-2.5 text-xs font-medium text-muted transition-colors hover:border-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}
        </div>
      </PageShell>
    </>
  );
}
