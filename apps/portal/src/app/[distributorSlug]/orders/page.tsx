'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { ordersApi } from '@wholo/api-client';
import type { OrderSummary, OrderStatus } from '@wholo/types';

const STATUS_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  SUBMITTED:  { color: '#D97036', bg: '#FEF3EC', label: 'Submitted' },
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

function SkeletonRow() {
  return (
    <div className="border-b border-[#E5E7EB] px-4 py-4" style={{ opacity: 0.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ height: 13, width: 96, background: '#E5E7EB', borderRadius: 3, marginBottom: 8 }} />
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
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D97036] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <style>{`
        @keyframes ol-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ol-row { animation: ol-fade-up 0.32s ease both; cursor: pointer; transition: background 0.12s; }
        .ol-row:hover { background: #FAFAFA; }
        @media (min-width: 481px) { .ol-shell { max-width: 480px; margin-left: auto; margin-right: auto; } }
      `}</style>

      <div className="ol-shell w-full flex flex-col flex-1">
        {loading ? (
          <>
            {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
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
                border: '1.5px solid #D97036', background: 'transparent', color: '#D97036',
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
            <p style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#9CA3AF',
              padding: '10px 16px 4px',
            }}>
              Order History
            </p>

            {orders.map((order, i) => {
              const delay = Math.min(0.06 + i * 0.04, 0.45);
              return (
                <div
                  key={order.id}
                  className="ol-row border-b border-[#E5E7EB] px-4 py-4"
                  style={{ animationDelay: `${delay}s` }}
                  onClick={() => router.push(`/${distributorSlug}/orders/${order.id}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    {/* Left: order number + date */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A', marginBottom: 4 }}>
                        {order.orderNumber}
                      </p>
                      <p style={{ fontSize: 12, color: '#9CA3AF' }}>
                        {fmtDate(order.submittedAt ?? order.createdAt)}
                      </p>
                    </div>
                    {/* Right: total + status */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A', marginBottom: 6 }}>
                        £{parseFloat(order.totalAmount).toFixed(2)}
                      </p>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                </div>
              );
            })}

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
      </div>
    </>
  );
}
