'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { AdminLayout } from '@/components/AdminLayout';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { ListPagination } from '@/components/list/ListPagination';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';
import { FilterBar } from '@/components/list/filter-bar/FilterBar';
import type { ActiveFilter, FilterFieldConfig } from '@/components/list/filter-bar/types';
import { adminOrdersApi } from '@wholo/admin-api-client';
import type { OrderSummary, OrderListParams } from '@wholo/types';
import { OrderStatus } from '@wholo/types';

// ─── Filter config ────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: OrderStatus.SUBMITTED, label: 'Pending' },
  { value: OrderStatus.ACCEPTED, label: 'Accepted' },
  { value: OrderStatus.REJECTED, label: 'Rejected' },
  { value: OrderStatus.CANCELLED, label: 'Cancelled' },
  { value: OrderStatus.COMPLETED, label: 'Completed' },
];

function fmtDateStr(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const ORDER_FILTER_FIELDS: FilterFieldConfig[] = [
  {
    field: 'status',
    label: 'Status',
    operators: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }],
    valueKind: 'multi-select',
    options: STATUS_OPTIONS,
  },
  {
    field: 'customerName',
    label: 'Customer',
    operators: [{ value: 'contains', label: 'contains' }],
    valueKind: 'text',
  },
  {
    field: 'requestedDeliveryDate',
    label: 'Delivery date',
    operators: [
      { value: 'after', label: 'after' },
      { value: 'before', label: 'before' },
      { value: 'between', label: 'between' },
    ],
    valueKind: 'date',
    formatValue: fmtDateStr,
  },
];

function buildApiParams(
  filters: ActiveFilter[],
  sort: 'createdAt' | 'requestedDeliveryDate',
  order: 'asc' | 'desc',
  cursor?: string,
): OrderListParams {
  const params: OrderListParams = { limit: 20, sortBy: sort, sortOrder: order };
  if (cursor) params.cursor = cursor;
  for (const f of filters) {
    if (f.field === 'status') {
      const val = (Array.isArray(f.value) ? f.value[0] : f.value) as OrderStatus;
      if (f.operator === 'is') params.status = val;
      else if (f.operator === 'is_not') params.statusExclude = val;
    } else if (f.field === 'customerName') {
      params.customerName = f.value as string;
    } else if (f.field === 'requestedDeliveryDate') {
      if (f.operator === 'after') params.deliveryDateAfter = f.value as string;
      else if (f.operator === 'before') params.deliveryDateBefore = f.value as string;
      else if (f.operator === 'between') {
        const [after, before] = (f.value as string).split(',');
        if (after) params.deliveryDateAfter = after;
        if (before) params.deliveryDateBefore = before;
      }
    }
  }
  return params;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  [OrderStatus.SUBMITTED]: { label: 'Pending', tone: 'orange' },
  [OrderStatus.ACCEPTED]: { label: 'Accepted', tone: 'green' },
  [OrderStatus.REJECTED]: { label: 'Rejected', tone: 'red' },
  [OrderStatus.CANCELLED]: { label: 'Cancelled', tone: 'gray' },
  [OrderStatus.COMPLETED]: { label: 'Completed', tone: 'blue' },
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'gray' as const };
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={['ml-1 inline h-3 w-3', active ? 'text-primary' : 'text-border'].join(' ')}>
      <path d="M8 3l3.5 5h-7L8 3z" fill="currentColor" opacity={active && dir === 'asc' ? 1 : 0.35} />
      <path d="M8 13l-3.5-5h7L8 13z" fill="currentColor" opacity={active && dir === 'desc' ? 1 : 0.35} />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {[80, 120, 64, 72, 80, 80].map((w, i) => (
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

  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [sortBy, setSortBy] = useState<'createdAt' | 'requestedDeliveryDate'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const buildParams = useCallback(
    (cursor: string | undefined) => buildApiParams(filters, sortBy, sortOrder, cursor),
    [filters, sortBy, sortOrder],
  );
  const fetchPage = useCallback(
    (token: string, params: OrderListParams) => adminOrdersApi.listOrders(params, token),
    [],
  );

  const {
    data: orders,
    setData: setOrders,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token: accessToken,
    fetchPage,
    buildParams,
    errorMessage: 'Failed to load orders. Please refresh.',
    deps: [filters, sortBy, sortOrder],
  });

  function handleOrderUpdate(updated: OrderSummary) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  function handleClearAll() {
    setFilters([]);
    setSortBy('createdAt');
    setSortOrder('desc');
  }

  function handleToggleDeliveryDateSort() {
    if (sortBy !== 'requestedDeliveryDate') {
      setSortBy('requestedDeliveryDate');
      setSortOrder('asc');
    } else {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    }
  }

  function handleClearSort() {
    setSortBy('createdAt');
    setSortOrder('desc');
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <ListPageHeader title="Orders" count={!isLoading ? total : undefined} />

      <FilterBar
        fields={ORDER_FILTER_FIELDS}
        filters={filters}
        onFiltersChange={setFilters}
        onClearAll={handleClearAll}
        extraChip={
          sortBy === 'requestedDeliveryDate' ? (
            <span className="inline-flex items-center rounded-md border border-border bg-surface text-xs">
              <button
                type="button"
                onClick={handleToggleDeliveryDateSort}
                className="flex items-center gap-1 px-2 py-1 hover:bg-border/30 transition-colors rounded-l-md text-muted"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
                <span>Delivery date</span>
              </button>
              <button
                type="button"
                onClick={handleClearSort}
                className="px-1.5 py-1 text-muted hover:text-red-500 transition-colors rounded-r-md"
                aria-label="Remove sort"
              >
                ×
              </button>
            </span>
          ) : undefined
        }
      />

      {isLoading ? (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                {['Order', 'Customer', 'Status', 'Total', 'Delivery Date', 'Submitted', 'Actions'].map((h) => (
                  <ListTh key={h}>{h}</ListTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </ListTableShell>
      ) : error ? (
        <ListErrorBanner message={error} />
      ) : orders.length === 0 ? (
        <ListEmptyState
          iconBgClassName="bg-[#fef3ec]"
          icon={
            <svg viewBox="0 0 64 64" fill="none" className="h-12 w-12" aria-hidden>
              <rect x="12" y="8" width="40" height="48" rx="4" fill="#fddcbe" />
              <line x1="22" y1="24" x2="42" y2="24" stroke="#d97036" strokeWidth="3" strokeLinecap="round" />
              <line x1="22" y1="32" x2="42" y2="32" stroke="#d97036" strokeWidth="3" strokeLinecap="round" />
              <line x1="22" y1="40" x2="32" y2="40" stroke="#d97036" strokeWidth="3" strokeLinecap="round" />
            </svg>
          }
          title={filters.length > 0 ? 'No matching orders' : 'No orders yet'}
          description={
            filters.length > 0
              ? 'Try adjusting or clearing your filters.'
              : 'Orders placed by your customers will appear here.'
          }
          action={
            filters.length > 0 ? (
              <button type="button" onClick={handleClearAll} className="text-sm text-primary hover:underline">
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Order</ListTh>
                <ListTh>Customer</ListTh>
                <ListTh>Status</ListTh>
                <ListTh>Total</ListTh>
                <ListTh>
                  <button type="button" onClick={handleToggleDeliveryDateSort} className="flex items-center hover:text-text transition-colors">
                    Delivery Date
                    <SortIcon active={sortBy === 'requestedDeliveryDate'} dir={sortBy === 'requestedDeliveryDate' ? sortOrder : 'asc'} />
                  </button>
                </ListTh>
                <ListTh>Submitted</ListTh>
                <ListTh>Actions</ListTh>
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
                      <OrderStatusBadge status={order.status} />
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm text-text">
                    <Link href={`/orders/${order.id}`} className="block">
                      £{parseFloat(order.totalAmount).toFixed(2)}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">
                    <Link href={`/orders/${order.id}`} className="block">
                      {fmtDateStr(order.requestedDeliveryDate)}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">
                    <Link href={`/orders/${order.id}`} className="block">
                      {fmtDateStr(order.submittedAt)}
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
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </AdminLayout>
  );
}
