'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PriceListDrawer } from '@/components/customers/PriceListDrawer';
import { CatalogueDrawer } from '@/components/customers/CatalogueDrawer';
import { DeliveryProfileDrawer } from '@/components/customers/DeliveryProfileDrawer';
import { adminCustomersApi } from '@wholo/admin-api-client';
import type { Customer } from '@wholo/types';
import { TradeRelationshipStatus } from '@wholo/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<TradeRelationshipStatus, { label: string; bg: string; text: string }> = {
  [TradeRelationshipStatus.PENDING_INVITE]: { label: 'Pending invite', bg: '#fef9c3', text: '#a16207' },
  [TradeRelationshipStatus.PENDING_REQUEST]: { label: 'Pending request', bg: '#dbeafe', text: '#1d4ed8' },
  [TradeRelationshipStatus.ACTIVE]: { label: 'Active', bg: '#dcfce7', text: '#15803d' },
  [TradeRelationshipStatus.SUSPENDED]: { label: 'Suspended', bg: '#fee2e2', text: '#b91c1c' },
  [TradeRelationshipStatus.INACTIVE]: { label: 'Inactive', bg: '#f3f4f6', text: '#6b7280' },
};

function StatusBadge({ status }: { status: TradeRelationshipStatus }) {
  const s = STATUS_META[status] ?? STATUS_META[TradeRelationshipStatus.INACTIVE];
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

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-20 px-8 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-[#eef2ff]">
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <circle cx="26" cy="22" r="10" fill="#c7d2fe" />
          <path d="M6 54c0-11 9-18 20-18s20 7 20 18" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
          <circle cx="46" cy="26" r="7" fill="#a5b4fc" />
          <path d="M38 54c0-8 5-13 8-15" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-text">No customers yet</h2>
      <p className="mb-8 max-w-xs text-sm text-muted leading-relaxed">
        Add your trade customers to manage orders, invoices, and deliveries.
      </p>
      <Link
        href="/customers/new"
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
      >
        Add your first customer
      </Link>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

// ─── Customer row ──────────────────────────────────────────────────────────────

function CustomerRow({ customer }: { customer: Customer }) {
  const [activeDrawer, setActiveDrawer] = useState<
    | { type: 'pricelist'; id: string }
    | { type: 'catalogue'; id: string }
    | { type: 'delivery-profile'; id: string }
    | null
  >(null);

  return (
    <>
    <tr className="group border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer">
      <td className="py-3 pl-5 pr-4">
        <Link href={`/customers/${customer.id}/edit`} className="block">
          <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
            {customer.organisation.name}
          </span>
          {customer.organisation.email && (
            <span className="block text-xs text-muted mt-0.5">{customer.organisation.email}</span>
          )}
        </Link>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <Link href={`/customers/${customer.id}/edit`} className="block">
          {customer.accountNumber ?? '—'}
        </Link>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <Link href={`/customers/${customer.id}/edit`} className="block">
          {customer.organisation.phone ?? '—'}
        </Link>
      </td>
      <td className="py-3 px-4">
        {customer.catalogues.length === 0 ? (
          <Link href={`/customers/${customer.id}/edit`} className="block text-sm text-muted">—</Link>
        ) : (
          <div className="flex flex-wrap gap-1">
            {customer.catalogues.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveDrawer({ type: 'catalogue', id: c.id }); }}
                className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text hover:border-primary hover:text-primary transition-colors"
              >
                {c.name} →
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        {customer.priceList ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveDrawer({ type: 'pricelist', id: customer.priceList!.id }); }}
            className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text hover:border-primary hover:text-primary transition-colors"
          >
            {customer.priceList.name} →
          </button>
        ) : (
          <Link href={`/customers/${customer.id}/edit`} className="block text-sm text-muted">—</Link>
        )}
      </td>
      <td className="py-3 px-4">
        {customer.deliveryProfile ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveDrawer({ type: 'delivery-profile', id: customer.deliveryProfile!.id }); }}
            className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text hover:border-primary hover:text-primary transition-colors"
          >
            {customer.deliveryProfile.name} →
          </button>
        ) : (
          <Link href={`/customers/${customer.id}/edit`} className="block text-sm text-muted">—</Link>
        )}
      </td>
      <td className="py-3 pl-4 pr-5">
        <Link href={`/customers/${customer.id}/edit`} className="block">
          <StatusBadge status={customer.status} />
        </Link>
      </td>
    </tr>
    {activeDrawer?.type === 'pricelist' && (
      <PriceListDrawer priceListId={activeDrawer.id} onClose={() => setActiveDrawer(null)} />
    )}
    {activeDrawer?.type === 'catalogue' && (
      <CatalogueDrawer catalogueId={activeDrawer.id} onClose={() => setActiveDrawer(null)} />
    )}
    {activeDrawer?.type === 'delivery-profile' && (
      <DeliveryProfileDrawer deliveryProfileId={activeDrawer.id} onClose={() => setActiveDrawer(null)} />
    )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(async (token: string, nextCursor?: string, append = false) => {
    try {
      const result = await adminCustomersApi.list(token, { limit: 20, cursor: nextCursor });
      setCustomers((prev) => append ? [...prev, ...result.data] : result.data);
      setCursor(result.pagination.nextCursor ?? undefined);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
    } catch {
      setError('Failed to load customers. Please refresh.');
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    setIsLoading(true);
    loadCustomers(accessToken).finally(() => setIsLoading(false));
  }, [accessToken, loadCustomers]);

  async function handleLoadMore() {
    if (!accessToken || !cursor) return;
    setIsLoadingMore(true);
    await loadCustomers(accessToken, cursor, true);
    setIsLoadingMore(false);
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Customers</h1>
          {!isLoading && total > 0 && (
            <p className="mt-0.5 text-sm text-muted">{total} customer{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Link
          href="/customers/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Add customer
        </Link>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <th className="py-2.5 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Customer
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Account #
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Phone
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Catalogues
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Price List
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Delivery Profile
                </th>
                <th className="py-2.5 pl-4 pr-5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <CustomerRow key={customer.id} customer={customer} />
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
