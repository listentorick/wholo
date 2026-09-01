'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Hash, Calendar, Truck, FileText, Banknote, CircleDot } from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { ordersApi } from '@wholo/api-client';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { Eyebrow } from '@/components/Eyebrow';
import type { OrderSummary, OrderStatus, OrderInvoiceSummary } from '@wholo/types';
import { formatMoney } from '@wholo/types';

const STATUS_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  SUBMITTED:  { color: 'hsl(var(--color-accent))', bg: 'hsl(var(--color-accent-light))', label: 'Submitted' },
  ACCEPTED:   { color: '#16A34A', bg: '#DCFCE7', label: 'Accepted'  },
  REJECTED:   { color: '#DC2626', bg: '#FEE2E2', label: 'Rejected'  },
  CANCELLED:  { color: '#6B7280', bg: '#F3F4F6', label: 'Cancelled' },
  COMPLETED:  { color: '#2563EB', bg: '#DBEAFE', label: 'Completed' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { color: '#6B7280', bg: '#F3F4F6', label: status };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: s.color, background: s.bg,
      padding: '3px 7px', borderRadius: 3,
    }}>
      {s.label}
    </span>
  );
}

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
      return 'hsl(var(--color-primary))';
    case 'FAILED':
      return '#DC2626';
    default:
      return '#F59E0B';
  }
}

function InvoiceCell({ summary }: { summary: OrderInvoiceSummary | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ fontSize: 13, color: '#6B7280' }}>
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
      className={`px-4 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF' }}
    >
      <span className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        {icon}
        {children}
      </span>
    </th>
  );
}

function SkeletonTableRow() {
  return (
    <tr className="border-b border-[#E5E7EB]" style={{ opacity: 0.5 }}>
      <td className="px-4 py-3"><div style={{ height: 13, width: 96, background: '#E5E7EB', borderRadius: 3 }} /></td>
      <td className="px-4 py-3"><div style={{ height: 12, width: 72, background: '#F3F4F6', borderRadius: 3 }} /></td>
      <td className="px-4 py-3"><div style={{ height: 12, width: 72, background: '#F3F4F6', borderRadius: 3 }} /></td>
      <td className="px-4 py-3"><div style={{ height: 12, width: 96, background: '#F3F4F6', borderRadius: 3 }} /></td>
      <td className="px-4 py-3 text-right"><div style={{ height: 13, width: 56, background: '#E5E7EB', borderRadius: 3, marginLeft: 'auto' }} /></td>
      <td className="px-4 py-3"><div style={{ height: 16, width: 64, background: '#F3F4F6', borderRadius: 3 }} /></td>
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="border-b border-[#E5E7EB] px-4 py-4" style={{ opacity: 0.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ height: 13, width: 96, background: '#E5E7EB', borderRadius: 3, marginBottom: 8 }} />
          <div style={{ height: 11, width: 64, background: '#F3F4F6', borderRadius: 3, marginBottom: 4 }} />
          <div style={{ height: 11, width: 64, background: '#F3F4F6', borderRadius: 3 }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ height: 13, width: 56, background: '#E5E7EB', borderRadius: 3, marginBottom: 8 }} />
          <div style={{ height: 11, width: 48, background: '#F3F4F6', borderRadius: 3 }} />
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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (cursor?: string) => {
    if (!accessToken) return;
    try {
      const res = await ordersApi.listOrders({ limit: 20, distributorSlug, ...(cursor ? { cursor } : {}) }, accessToken);
      if (cursor) {
        setOrders((prev) => [...prev, ...res.data]);
      } else {
        setOrders(res.data);
      }
      setNextCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
    } catch {
      setError('Failed to load orders');
    }
  }, [accessToken, distributorSlug]);

  useEffect(() => {
    if (authLoading || !accessToken) return;
    setLoading(true);
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

  return (
    <>
      <style>{`
        @keyframes ol-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ol-row { animation: ol-fade-up 0.32s ease both; cursor: pointer; transition: background 0.12s; }
        .ol-row:hover { background: #FAFAFA; }
      `}</style>

      <PageShell padding="none" width="full">
        {loading ? (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <tbody>
                  {[0, 1, 2, 3].map((i) => <SkeletonTableRow key={i} />)}
                </tbody>
              </table>
            </div>
            <div className="md:hidden">
              {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          </>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center py-20 px-6 text-center">
            <p style={{ fontSize: 13, color: '#9CA3AF' }}>{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center gap-6"
            style={{ animation: 'ol-fade-up 0.4s ease both 0.1s' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              border: '1.5px solid #E5E7EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#D5D9E0',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} style={{ width: 24, height: 24 }}>
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <line x1="8" y1="8" x2="16" y2="8" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="8" y1="16" x2="12" y2="16" />
              </svg>
            </div>
            <div className="flex flex-col gap-1.5">
              <p style={{ fontSize: 15, color: '#1A1A1A', fontWeight: 400 }}>No orders yet</p>
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Place your first order to get started</p>
            </div>
            <button
              onClick={() => router.push(`/${distributorSlug}/products`)}
              style={{
                border: '1.5px solid hsl(var(--color-primary))', background: 'transparent', color: 'hsl(var(--color-primary))',
                padding: '11px 28px', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Start an Order
            </button>
          </div>
        ) : (
          <>
            {/* Section label */}
            <Eyebrow className="mx-4 mb-2 mt-2.5">Order history</Eyebrow>

            {/* Desktop: real table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E7EB]">
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
                        className="ol-row border-b border-[#E5E7EB]"
                        style={{ animationDelay: `${delay}s` }}
                        onClick={() => router.push(`/${distributorSlug}/orders/${order.id}`)}
                      >
                        <td className="px-4 py-3" style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>
                          {order.orderNumber}
                        </td>
                        <td className="px-4 py-3" style={{ fontSize: 13, color: '#6B7280' }}>
                          {fmtDate(order.submittedAt ?? order.createdAt)}
                        </td>
                        <td className="px-4 py-3" style={{ fontSize: 13, color: '#6B7280' }}>
                          {order.requestedDeliveryDate ? fmtDate(order.requestedDeliveryDate) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <InvoiceCell summary={order.invoiceSummary} />
                        </td>
                        <td className="px-4 py-3 text-right" style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>
                          {formatMoney(order.totalAmount, order.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={order.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list */}
            <div className="md:hidden">
              {orders.map((order, i) => {
                const delay = Math.min(0.06 + i * 0.04, 0.45);
                return (
                  <div
                    key={order.id}
                    className="ol-row border-b border-[#E5E7EB] px-4 py-4"
                    style={{ animationDelay: `${delay}s` }}
                    onClick={() => router.push(`/${distributorSlug}/orders/${order.id}`)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A', marginBottom: 4 }}>
                          {order.orderNumber}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#9CA3AF' }}>
                            <Calendar className="h-3 w-3 flex-shrink-0" strokeWidth={1.5} />
                            {fmtDate(order.submittedAt ?? order.createdAt)}
                          </span>
                          {order.requestedDeliveryDate && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#9CA3AF' }}>
                              <Truck className="h-3 w-3 flex-shrink-0" strokeWidth={1.5} />
                              {fmtDate(order.requestedDeliveryDate)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A', marginBottom: 6 }}>
                          {formatMoney(order.totalAmount, order.currency)}
                        </p>
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="px-4 py-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    border: '1.5px solid #E5E7EB', background: 'transparent',
                    color: '#6B7280', padding: '10px 24px', fontSize: 12,
                    fontWeight: 500, cursor: loadingMore ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', opacity: loadingMore ? 0.6 : 1,
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </PageShell>
    </>
  );
}
