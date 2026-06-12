'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminOrdersApi } from '@wholo/admin-api-client';
import type { OrderSummary } from '@wholo/types';
import { OrderStatus } from '@wholo/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  [OrderStatus.SUBMITTED]:  { label: 'Pending',   bg: '#fef3ec', text: '#d97036' },
  [OrderStatus.ACCEPTED]:   { label: 'Accepted',  bg: '#dcfce7', text: '#15803d' },
  [OrderStatus.REJECTED]:   { label: 'Rejected',  bg: '#fee2e2', text: '#b91c1c' },
  [OrderStatus.CANCELLED]:  { label: 'Cancelled', bg: '#f3f4f6', text: '#6b7280' },
  [OrderStatus.COMPLETED]:  { label: 'Completed', bg: '#dbeafe', text: '#1d4ed8' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] ?? { label: status, bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.text }} />
      {s.label}
    </span>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: OrderStatus | 'ALL' }[] = [
  { label: 'All',       value: 'ALL' },
  { label: 'Pending',   value: OrderStatus.SUBMITTED },
  { label: 'Accepted',  value: OrderStatus.ACCEPTED },
  { label: 'Rejected',  value: OrderStatus.REJECTED },
  { label: 'Cancelled', value: OrderStatus.CANCELLED },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {[80, 120, 64, 72, 80].map((w, i) => (
        <td key={i} className="py-3.5 px-4">
          <div className="h-3.5 animate-pulse rounded bg-border" style={{ width: w }} />
        </td>
      ))}
      <td className="py-3.5 px-4">
        <div className="h-3.5 w-16 animate-pulse rounded bg-border" />
      </td>
    </tr>
  );
}

// ─── Quick-action buttons ─────────────────────────────────────────────────────

interface QuickActionsProps {
  order: OrderSummary;
  token: string;
  onUpdate: (updated: OrderSummary) => void;
}

function QuickActions({ order, token, onUpdate }: QuickActionsProps) {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleAccept = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (accepting) return;
    setAccepting(true);
    try {
      const updated = await adminOrdersApi.acceptOrder(order.id, token);
      onUpdate({ ...order, status: updated.status, acceptedAt: updated.acceptedAt });
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (rejecting) return;
    setRejecting(true);
    try {
      const updated = await adminOrdersApi.rejectOrder(order.id, { reason: 'Rejected by distributor' }, token);
      onUpdate({ ...order, status: updated.status, rejectedAt: updated.rejectedAt });
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleAccept}
        disabled={accepting || rejecting}
        className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: '#dcfce7', color: '#15803d' }}
      >
        {accepting ? '…' : 'Accept'}
      </button>
      <button
        type="button"
        onClick={handleReject}
        disabled={accepting || rejecting}
        className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: '#fee2e2', color: '#b91c1c' }}
      >
        {rejecting ? '…' : 'Reject'}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');

  const loadOrders = useCallback(async (
    token: string,
    status: OrderStatus | 'ALL',
    nextCursor?: string,
    append = false,
  ) => {
    try {
      const params = {
        limit: 20,
        ...(nextCursor ? { cursor: nextCursor } : {}),
        ...(status !== 'ALL' ? { status } : {}),
      };
      const result = await adminOrdersApi.listOrders(params, token);
      setOrders((prev) => append ? [...prev, ...result.data] : result.data);
      setCursor(result.pagination.nextCursor ?? undefined);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
    } catch {
      setError('Failed to load orders. Please refresh.');
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    loadOrders(accessToken, statusFilter).finally(() => setIsLoading(false));
  }, [accessToken, statusFilter, loadOrders]);

  async function handleLoadMore() {
    if (!accessToken || !cursor) return;
    setIsLoadingMore(true);
    await loadOrders(accessToken, statusFilter, cursor, true);
    setIsLoadingMore(false);
  }

  function handleOrderUpdate(updated: OrderSummary) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      {/* Page header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Orders</h1>
          {!isLoading && total > 0 && (
            <p className="mt-0.5 text-sm text-muted">{total} order{total !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-0.5 border-b border-border">
        {FILTER_TABS.map((tab) => {
          const active = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                if (statusFilter !== tab.value) {
                  setStatusFilter(tab.value);
                  setCursor(undefined);
                }
              }}
              className="relative px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ color: active ? 'var(--color-primary)' : 'var(--color-muted)' }}
            >
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                {['Order', 'Customer', 'Status', 'Total', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-20 px-8 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#fef3ec]">
            <svg viewBox="0 0 64 64" fill="none" className="h-12 w-12" aria-hidden>
              <rect x="12" y="8" width="40" height="48" rx="4" fill="#fddcbe" />
              <line x1="22" y1="24" x2="42" y2="24" stroke="#d97036" strokeWidth="3" strokeLinecap="round" />
              <line x1="22" y1="32" x2="42" y2="32" stroke="#d97036" strokeWidth="3" strokeLinecap="round" />
              <line x1="22" y1="40" x2="32" y2="40" stroke="#d97036" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="mb-1.5 text-base font-semibold text-text">
            {statusFilter === 'ALL' ? 'No orders yet' : `No ${statusFilter.toLowerCase()} orders`}
          </h2>
          <p className="text-sm text-muted">
            {statusFilter === 'ALL'
              ? 'Orders placed by your customers will appear here.'
              : `Orders with status "${STATUS_META[statusFilter]?.label ?? statusFilter}" will appear here.`}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <th className="py-2.5 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">Order</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Customer</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Total</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Submitted</th>
                <th className="py-2.5 pl-4 pr-5 text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="group border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors"
                >
                  <td className="py-3 pl-5 pr-4">
                    <Link href={`/orders/${order.id}`} className="block">
                      <span className="font-medium text-sm text-text group-hover:text-primary transition-colors">
                        {order.orderNumber}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <Link href={`/orders/${order.id}`} className="block text-sm text-text">
                      {order.traderCustomerName}
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <Link href={`/orders/${order.id}`} className="block">
                      <StatusBadge status={order.status} />
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm text-text">
                    <Link href={`/orders/${order.id}`} className="block">
                      £{parseFloat(order.totalAmount).toFixed(2)}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">
                    <Link href={`/orders/${order.id}`} className="block">
                      {fmtDate(order.submittedAt)}
                    </Link>
                  </td>
                  <td className="py-3 pl-4 pr-5">
                    {order.status === OrderStatus.SUBMITTED && accessToken ? (
                      <QuickActions order={order} token={accessToken} onUpdate={handleOrderUpdate} />
                    ) : (
                      <Link href={`/orders/${order.id}`} className="text-xs text-muted hover:text-text transition-colors">
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border px-5 py-3.5">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
