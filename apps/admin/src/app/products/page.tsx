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
import { adminProductsApi, adminProductTypesApi, adminSuppliersApi } from '@wholo/admin-api-client';
import type { Product, ProductType, Supplier, ProductListParams } from '@wholo/types';
import { ProductStatus } from '@wholo/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<ProductStatus, { label: string; tone: StatusTone }> = {
  [ProductStatus.ACTIVE]: { label: 'Active', tone: 'green' },
  [ProductStatus.DRAFT]: { label: 'Draft', tone: 'yellow' },
  [ProductStatus.ARCHIVED]: { label: 'Archived', tone: 'gray' },
};

function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META[ProductStatus.DRAFT];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function buildApiParams(filters: ActiveFilter[], cursor: string | undefined): ProductListParams {
  const params: ProductListParams = { limit: 20, cursor };
  for (const f of filters) {
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.field === 'status') params.status = values as ProductStatus[];
    else if (f.field === 'productType') params.productTypeId = values;
    else if (f.field === 'supplier') params.supplierId = values;
  }
  return params;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function ProductsEmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <ListEmptyState
      iconBgClassName="bg-[#fef3e8]"
      icon={
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <rect x="8" y="20" width="48" height="36" rx="4" fill="#f5d9c0" />
          <rect x="8" y="20" width="48" height="10" rx="4" fill="#e8b990" />
          <path d="M24 20v-6a8 8 0 0116 0v6" stroke="#d97036" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="26" y="34" width="12" height="10" rx="2" fill="#d97036" opacity="0.5" />
          <circle cx="48" cy="14" r="7" fill="#d97036" />
          <path d="M45 14l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
      title={hasFilters ? 'No matching products' : 'First up: what are you selling?'}
      description={
        hasFilters
          ? 'Try adjusting or clearing your filters.'
          : 'Before you open your store, first you need some products.'
      }
      action={
        hasFilters ? (
          <button type="button" onClick={onClearFilters} className="text-sm text-primary hover:underline">
            Clear filters
          </button>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-border/20"
            >
              Find products to sell
            </button>
            <Link
              href="/products/new"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              Add your products
            </Link>
          </div>
        )
      }
    />
  );
}

// ─── Product row ──────────────────────────────────────────────────────────────

function ProductRow({ product }: { product: Product }) {
  const href = `/products/${product.id}/edit`;
  return (
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
            {product.name}
          </span>
          {product.sku && (
            <span className="block text-xs text-muted mt-0.5">SKU: {product.sku}</span>
          )}
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href}>
          <ProductStatusBadge status={product.status} />
        </ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <ListCellLink href={href}>{product.productType?.name ?? '—'}</ListCellLink>
      </td>
      <td className="py-3 pl-4 pr-5 text-sm text-muted">
        <ListCellLink href={href}>{product.supplier?.name ?? '—'}</ListCellLink>
      </td>
    </ListRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([adminProductTypesApi.list(accessToken), adminSuppliersApi.list(accessToken)])
      .then(([types, sups]) => {
        setProductTypes(types);
        setSuppliers(sups);
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
      options: [
        { value: ProductStatus.ACTIVE, label: 'Active' },
        { value: ProductStatus.DRAFT, label: 'Draft' },
        { value: ProductStatus.ARCHIVED, label: 'Archived' },
      ],
    },
    {
      field: 'productType',
      label: 'Type',
      operators: [{ value: 'is', label: 'is' }],
      valueKind: 'multi-select',
      options: productTypes.map((pt) => ({ value: pt.id, label: pt.name })),
    },
    {
      field: 'supplier',
      label: 'Supplier',
      operators: [{ value: 'is', label: 'is' }],
      valueKind: 'multi-select',
      options: suppliers.map((s) => ({ value: s.id, label: s.name })),
    },
  ], [productTypes, suppliers]);

  const [filters, setFilters] = useState<ActiveFilter[]>([]);

  const buildParams = useCallback(
    (cursor: string | undefined) => buildApiParams(filters, cursor),
    [filters],
  );

  const {
    data: products,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token: accessToken,
    fetchPage: adminProductsApi.list,
    buildParams,
    errorMessage: 'Failed to load products. Please refresh.',
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
        title="Products"
        count={!isLoading ? total : undefined}
        actions={
          <Link
            href="/products/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Add product
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
      ) : products.length === 0 ? (
        <ProductsEmptyState hasFilters={filters.length > 0} onClearFilters={() => setFilters([])} />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Product</ListTh>
                <ListTh>Status</ListTh>
                <ListTh>Type</ListTh>
                <ListTh>Supplier</ListTh>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))}
            </tbody>
          </table>
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </AdminLayout>
  );
}
