'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminOrdersApi } from '@wholo/admin-api-client';
import type { OrderSummary, OrderListParams } from '@wholo/types';
import { OrderStatus } from '@wholo/types';

// ─── Filter types ─────────────────────────────────────────────────────────────

type FilterField = 'status' | 'customerName' | 'requestedDeliveryDate';
type FilterOperator = 'is' | 'is_not' | 'contains' | 'after' | 'before' | 'between';

interface ActiveFilter {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string | string[];
}

const FIELD_LABELS: Record<FilterField, string> = {
  status: 'Status',
  customerName: 'Customer',
  requestedDeliveryDate: 'Delivery date',
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  after: 'after',
  before: 'before',
  between: 'between',
};

const OPERATORS_BY_FIELD: Record<FilterField, FilterOperator[]> = {
  status: ['is', 'is_not'],
  customerName: ['contains'],
  requestedDeliveryDate: ['after', 'before', 'between'],
};

const STATUS_OPTIONS = [
  { value: OrderStatus.SUBMITTED, label: 'Pending' },
  { value: OrderStatus.ACCEPTED, label: 'Accepted' },
  { value: OrderStatus.REJECTED, label: 'Rejected' },
  { value: OrderStatus.CANCELLED, label: 'Cancelled' },
  { value: OrderStatus.COMPLETED, label: 'Completed' },
];

function uid() {
  return Math.random().toString(36).slice(2);
}

function fmtDateStr(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatFilterValue(filter: ActiveFilter): string {
  if (filter.field === 'status') {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    return values.map((v) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v).join(', ');
  }
  if (filter.field === 'requestedDeliveryDate' && filter.operator === 'between') {
    const [after, before] = (filter.value as string).split(',');
    return `${fmtDateStr(after)} – ${fmtDateStr(before)}`;
  }
  if (filter.field === 'requestedDeliveryDate') {
    return fmtDateStr(filter.value as string);
  }
  return filter.value as string;
}

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

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  filter,
  onEdit,
  onRemove,
}: {
  filter: ActiveFilter;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/5 text-xs">
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-1 px-2 py-1 hover:bg-primary/10 transition-colors rounded-l-md"
      >
        <span className="text-muted">{FIELD_LABELS[filter.field]}</span>
        <span className="text-muted italic">{OPERATOR_LABELS[filter.operator]}</span>
        <span className="font-medium text-text">{formatFilterValue(filter)}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="px-1.5 py-1 text-muted hover:text-red-500 transition-colors rounded-r-md"
        aria-label="Remove filter"
      >
        ×
      </button>
    </span>
  );
}

// ─── Filter popover ───────────────────────────────────────────────────────────

function FilterPopover({
  initial,
  onApply,
  onCancel,
}: {
  initial?: ActiveFilter;
  onApply: (filter: Omit<ActiveFilter, 'id'>) => void;
  onCancel: () => void;
}) {
  const [field, setField] = useState<FilterField>(initial?.field ?? 'status');
  const [operator, setOperator] = useState<FilterOperator>(
    initial?.operator ?? OPERATORS_BY_FIELD[initial?.field ?? 'status'][0],
  );
  const [value, setValue] = useState<string>(
    Array.isArray(initial?.value)
      ? (initial.value[0] ?? '')
      : (initial?.value as string | undefined) ?? '',
  );
  const [statusSelections, setStatusSelections] = useState<string[]>(
    Array.isArray(initial?.value) ? initial.value : initial?.value ? [initial.value as string] : [],
  );
  const [betweenAfter, setBetweenAfter] = useState(
    initial?.operator === 'between' ? (initial.value as string).split(',')[0] ?? '' : '',
  );
  const [betweenBefore, setBetweenBefore] = useState(
    initial?.operator === 'between' ? (initial.value as string).split(',')[1] ?? '' : '',
  );

  function handleFieldChange(f: FilterField) {
    setField(f);
    const ops = OPERATORS_BY_FIELD[f];
    setOperator(ops[0]);
    setValue('');
    setStatusSelections([]);
    setBetweenAfter('');
    setBetweenBefore('');
  }

  function handleOperatorChange(op: FilterOperator) {
    setOperator(op);
    setValue('');
    setBetweenAfter('');
    setBetweenBefore('');
  }

  function toggleStatus(val: string) {
    setStatusSelections((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    );
  }

  function handleApply() {
    let finalValue: string | string[] = value;
    if (field === 'status') finalValue = statusSelections;
    if (operator === 'between') finalValue = `${betweenAfter},${betweenBefore}`;
    onApply({ field, operator, value: finalValue });
  }

  function canApply(): boolean {
    if (field === 'status') return statusSelections.length > 0;
    if (operator === 'between') return !!betweenAfter && !!betweenBefore;
    return !!value.trim();
  }

  return (
    <div
      className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-border bg-white shadow-lg border-l-[3px] border-l-primary"
    >
      <div className="p-4 space-y-3">
        {/* Field */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Field</label>
          <select
            value={field}
            onChange={(e) => handleFieldChange(e.target.value as FilterField)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {(Object.keys(FIELD_LABELS) as FilterField[]).map((f) => (
              <option key={f} value={f}>{FIELD_LABELS[f]}</option>
            ))}
          </select>
        </div>

        {/* Operator */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Operator</label>
          <select
            value={operator}
            onChange={(e) => handleOperatorChange(e.target.value as FilterOperator)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {OPERATORS_BY_FIELD[field].map((op) => (
              <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
            ))}
          </select>
        </div>

        {/* Value */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Value</label>

          {field === 'status' ? (
            <div className="space-y-1.5 rounded-md border border-border p-2.5">
              {STATUS_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={statusSelections.includes(opt.value)}
                    onChange={() => toggleStatus(opt.value)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span className="text-sm text-text">{opt.label}</span>
                </label>
              ))}
            </div>
          ) : operator === 'between' ? (
            <div className="space-y-1.5">
              <input
                type="date"
                value={betweenAfter}
                onChange={(e) => setBetweenAfter(e.target.value)}
                placeholder="From"
                className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <input
                type="date"
                value={betweenBefore}
                onChange={(e) => setBetweenBefore(e.target.value)}
                placeholder="To"
                className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          ) : field === 'requestedDeliveryDate' ? (
            <input
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Type to filter…"
              className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => { if (e.key === 'Enter' && canApply()) handleApply(); }}
              autoFocus
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Apply →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  sortBy,
  sortOrder,
  onAddFilter,
  onEditFilter,
  onRemoveFilter,
  onClearAll,
  onToggleSortDirection,
  onClearSort,
}: {
  filters: ActiveFilter[];
  sortBy: 'createdAt' | 'requestedDeliveryDate';
  sortOrder: 'asc' | 'desc';
  onAddFilter: () => void;
  onEditFilter: (id: string) => void;
  onRemoveFilter: (id: string) => void;
  onClearAll: () => void;
  onToggleSortDirection: () => void;
  onClearSort: () => void;
}) {
  const hasFilters = filters.length > 0 || sortBy === 'requestedDeliveryDate';

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <FilterChip
          key={f.id}
          filter={f}
          onEdit={() => onEditFilter(f.id)}
          onRemove={() => onRemoveFilter(f.id)}
        />
      ))}

      {sortBy === 'requestedDeliveryDate' && (
        <span className="inline-flex items-center rounded-md border border-border bg-surface text-xs">
          <button
            type="button"
            onClick={onToggleSortDirection}
            className="flex items-center gap-1 px-2 py-1 hover:bg-border/30 transition-colors rounded-l-md text-muted"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
            <span>Delivery date</span>
          </button>
          <button
            type="button"
            onClick={onClearSort}
            className="px-1.5 py-1 text-muted hover:text-red-500 transition-colors rounded-r-md"
            aria-label="Remove sort"
          >
            ×
          </button>
        </span>
      )}

      <button
        type="button"
        onClick={onAddFilter}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted hover:border-primary hover:text-primary transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3 w-3">
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="3" y1="8" x2="13" y2="8" />
        </svg>
        Add filter
      </button>

      {hasFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted hover:text-red-500 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
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

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [sortBy, setSortBy] = useState<'createdAt' | 'requestedDeliveryDate'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Popover state: null = closed, 'add' = adding new, filterId = editing existing
  const [popoverTarget, setPopoverTarget] = useState<'add' | string | null>(null);
  const filterAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (filterAreaRef.current && !filterAreaRef.current.contains(e.target as Node)) {
        setPopoverTarget(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const load = useCallback(async (
    token: string,
    activeFilters: ActiveFilter[],
    sort: 'createdAt' | 'requestedDeliveryDate',
    order: 'asc' | 'desc',
    nextCursor?: string,
    append = false,
  ) => {
    try {
      const params = buildApiParams(activeFilters, sort, order, nextCursor);
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
    setCursor(undefined);
    setIsLoading(true);
    setError(null);
    load(accessToken, filters, sortBy, sortOrder).finally(() => setIsLoading(false));
  }, [accessToken, filters, sortBy, sortOrder, load]);

  async function handleLoadMore() {
    if (!accessToken || !cursor) return;
    setIsLoadingMore(true);
    await load(accessToken, filters, sortBy, sortOrder, cursor, true);
    setIsLoadingMore(false);
  }

  function handleOrderUpdate(updated: OrderSummary) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  function handleAddFilter(f: Omit<ActiveFilter, 'id'>) {
    setFilters((prev) => [...prev, { ...f, id: uid() }]);
    setPopoverTarget(null);
  }

  function handleEditFilter(id: string, f: Omit<ActiveFilter, 'id'>) {
    setFilters((prev) => prev.map((x) => (x.id === id ? { ...f, id } : x)));
    setPopoverTarget(null);
  }

  function handleRemoveFilter(id: string) {
    setFilters((prev) => prev.filter((f) => f.id !== id));
    if (popoverTarget === id) setPopoverTarget(null);
  }

  function handleClearAll() {
    setFilters([]);
    setSortBy('createdAt');
    setSortOrder('desc');
    setPopoverTarget(null);
  }

  function handleToggleDeliveryDateSort() {
    if (sortBy !== 'requestedDeliveryDate') {
      setSortBy('requestedDeliveryDate');
      setSortOrder('asc');
    } else {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    }
    setCursor(undefined);
  }

  function handleClearSort() {
    setSortBy('createdAt');
    setSortOrder('desc');
    setCursor(undefined);
  }

  const editingFilter = popoverTarget && popoverTarget !== 'add'
    ? filters.find((f) => f.id === popoverTarget)
    : undefined;

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

      {/* Filter bar */}
      <div ref={filterAreaRef} className="relative mb-4">
        <FilterBar
          filters={filters}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onAddFilter={() => setPopoverTarget((p) => (p === 'add' ? null : 'add'))}
          onEditFilter={(id) => setPopoverTarget((p) => (p === id ? null : id))}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={handleClearAll}
          onToggleSortDirection={handleToggleDeliveryDateSort}
          onClearSort={handleClearSort}
        />

        {popoverTarget !== null && (
          <FilterPopover
            initial={editingFilter}
            onApply={(f) =>
              editingFilter
                ? handleEditFilter(editingFilter.id, f)
                : handleAddFilter(f)
            }
            onCancel={() => setPopoverTarget(null)}
          />
        )}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                {['Order', 'Customer', 'Status', 'Total', 'Delivery Date', 'Submitted', 'Actions'].map((h) => (
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
            {filters.length > 0 ? 'No matching orders' : 'No orders yet'}
          </h2>
          <p className="text-sm text-muted">
            {filters.length > 0
              ? 'Try adjusting or clearing your filters.'
              : 'Orders placed by your customers will appear here.'}
          </p>
          {filters.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
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
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  <button type="button" onClick={handleToggleDeliveryDateSort} className="flex items-center hover:text-text transition-colors">
                    Delivery Date
                    <SortIcon active={sortBy === 'requestedDeliveryDate'} dir={sortBy === 'requestedDeliveryDate' ? sortOrder : 'asc'} />
                  </button>
                </th>
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
