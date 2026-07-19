'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { AdminLayout } from '@/components/AdminLayout';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { ListRow } from '@/components/list/ListRow';
import { ListCellLink } from '@/components/list/ListCellLink';
import { ListPagination } from '@/components/list/ListPagination';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListSpinner } from '@/components/list/ListSpinner';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';
import { FilterBar } from '@/components/list/filter-bar/FilterBar';
import type { ActiveFilter, FilterFieldConfig } from '@/components/list/filter-bar/types';
import { PriceListDrawer } from '@/components/customers/PriceListDrawer';
import { CatalogueDrawer } from '@/components/customers/CatalogueDrawer';
import { DeliveryProfileDrawer } from '@/components/customers/DeliveryProfileDrawer';
import {
  adminCustomersApi,
  adminPriceListsApi,
  adminDeliveryProfilesApi,
  adminCataloguesApi,
} from '@wholo/admin-api-client';
import type {
  Customer,
  PriceListSummary,
  DeliveryProfileSummary,
  CatalogueSummary,
  CustomerListParams,
} from '@wholo/types';
import { TradeRelationshipStatus } from '@wholo/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<TradeRelationshipStatus, { label: string; tone: StatusTone }> = {
  [TradeRelationshipStatus.PENDING_INVITE]: { label: 'Pending invite', tone: 'yellow' },
  [TradeRelationshipStatus.PENDING_REQUEST]: { label: 'Pending request', tone: 'blue' },
  [TradeRelationshipStatus.ACTIVE]: { label: 'Active', tone: 'green' },
  [TradeRelationshipStatus.SUSPENDED]: { label: 'Suspended', tone: 'red' },
  [TradeRelationshipStatus.INACTIVE]: { label: 'Inactive', tone: 'gray' },
};

function CustomerStatusBadge({ status }: { status: TradeRelationshipStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META[TradeRelationshipStatus.INACTIVE];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function buildApiParams(filters: ActiveFilter[], cursor: string | undefined): CustomerListParams {
  const params: CustomerListParams = { limit: 20, cursor };
  for (const f of filters) {
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.field === 'status') params.status = values as TradeRelationshipStatus[];
    else if (f.field === 'priceList') params.priceListId = values;
    else if (f.field === 'deliveryProfile') params.deliveryProfileId = values;
    else if (f.field === 'catalogue') params.catalogueId = values;
  }
  return params;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function CustomersEmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <ListEmptyState
      icon={
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <circle cx="26" cy="22" r="10" className="fill-primary/40" />
          <path d="M6 54c0-11 9-18 20-18s20 7 20 18" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
          <circle cx="46" cy="26" r="7" className="fill-primary/30" />
          <path d="M38 54c0-8 5-13 8-15" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
        </svg>
      }
      title={hasFilters ? 'No matching customers' : 'No customers yet'}
      description={
        hasFilters
          ? 'Try adjusting or clearing your filters.'
          : 'Add your trade customers to manage orders, invoices, and deliveries.'
      }
      action={
        hasFilters ? (
          <button type="button" onClick={onClearFilters} className="text-sm text-primary hover:underline">
            Clear filters
          </button>
        ) : (
          <Link
            href="/customers/new"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Add your first customer
          </Link>
        )
      }
    />
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

  const href = `/customers/${customer.id}`;

  return (
    <>
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
            {customer.organisation.name}
          </span>
          {customer.organisation.email && (
            <span className="block text-xs text-muted mt-0.5">{customer.organisation.email}</span>
          )}
        </ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <ListCellLink href={href}>{customer.accountNumber ?? '—'}</ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <ListCellLink href={href}>{customer.organisation.phone ?? '—'}</ListCellLink>
      </td>
      <td className="py-3 px-4">
        {customer.catalogues.length === 0 ? (
          <ListCellLink href={href} className="text-sm text-muted">—</ListCellLink>
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
          <ListCellLink href={href} className="text-sm text-muted">—</ListCellLink>
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
          <ListCellLink href={href} className="text-sm text-muted">—</ListCellLink>
        )}
      </td>
      <td className="py-3 pl-4 pr-5">
        <ListCellLink href={href}>
          <CustomerStatusBadge status={customer.status} />
        </ListCellLink>
      </td>
    </ListRow>
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

  const [priceLists, setPriceLists] = useState<PriceListSummary[]>([]);
  const [deliveryProfiles, setDeliveryProfiles] = useState<DeliveryProfileSummary[]>([]);
  const [catalogues, setCatalogues] = useState<CatalogueSummary[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      adminPriceListsApi.list(accessToken, { limit: 100 }),
      adminDeliveryProfilesApi.list(accessToken, { limit: 100 }),
      adminCataloguesApi.list(accessToken, { limit: 100 }),
    ])
      .then(([pl, dp, cat]) => {
        setPriceLists(pl.data.filter((p) => p.active));
        setDeliveryProfiles(dp.data);
        setCatalogues(cat.data);
      })
      .catch(() => {})
      .finally(() => setMetaLoading(false));
  }, [accessToken]);

  const filterFields = useMemo<FilterFieldConfig[]>(() => [
    {
      field: 'status',
      label: 'Status',
      operators: [{ value: 'is', label: 'is' }],
      valueKind: 'multi-select',
      options: (Object.keys(STATUS_META) as TradeRelationshipStatus[]).map((s) => ({
        value: s,
        label: STATUS_META[s].label,
      })),
    },
    {
      field: 'priceList',
      label: 'Price List',
      operators: [{ value: 'is', label: 'is' }],
      valueKind: 'multi-select',
      options: priceLists.map((pl) => ({ value: pl.id, label: pl.name })),
    },
    {
      field: 'deliveryProfile',
      label: 'Delivery Profile',
      operators: [{ value: 'is', label: 'is' }],
      valueKind: 'multi-select',
      options: deliveryProfiles.map((dp) => ({ value: dp.id, label: dp.name })),
    },
    {
      field: 'catalogue',
      label: 'Catalogue',
      operators: [{ value: 'is', label: 'is' }],
      valueKind: 'multi-select',
      options: catalogues.map((c) => ({ value: c.id, label: c.name })),
    },
  ], [priceLists, deliveryProfiles, catalogues]);

  const [filters, setFilters] = useState<ActiveFilter[]>([]);

  const buildParams = useCallback(
    (cursor: string | undefined) => buildApiParams(filters, cursor),
    [filters],
  );

  const {
    data: customers,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token: accessToken,
    fetchPage: adminCustomersApi.list,
    buildParams,
    errorMessage: 'Failed to load customers. Please refresh.',
    deps: [filters],
  });

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <ListPageHeader
        title="Customers"
        count={!isLoading ? total : undefined}
        actions={
          <Link
            href="/customers/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Add customer
          </Link>
        }
      />

      {!metaLoading && (
        <FilterBar
          fields={filterFields}
          filters={filters}
          onFiltersChange={setFilters}
          onClearAll={() => setFilters([])}
        />
      )}

      {isLoading ? (
        <ListSpinner />
      ) : error ? (
        <ListErrorBanner message={error} />
      ) : customers.length === 0 ? (
        <CustomersEmptyState hasFilters={filters.length > 0} onClearFilters={() => setFilters([])} />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Customer</ListTh>
                <ListTh>Account #</ListTh>
                <ListTh>Phone</ListTh>
                <ListTh>Catalogues</ListTh>
                <ListTh>Price List</ListTh>
                <ListTh>Delivery Profile</ListTh>
                <ListTh>Status</ListTh>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <CustomerRow key={customer.id} customer={customer} />
              ))}
            </tbody>
          </table>
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </AdminLayout>
  );
}
