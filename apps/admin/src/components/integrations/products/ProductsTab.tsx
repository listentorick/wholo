'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingProductListParams } from '@wholo/types';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { FilterBar } from '@/components/list/filter-bar/FilterBar';
import type { ActiveFilter, FilterFieldConfig } from '@/components/list/filter-bar/types';
import { BulkImportControl } from '@/components/integrations/BulkImportControl';
import { AccountingProductsTable } from './AccountingProductsTable';

interface Props {
  token: string;
  providerLabel: string;
  onProductsChanged?: () => void;
}

const TYPE_OPTIONS = [
  { value: 'sold', label: 'Sold' },
  { value: 'purchased', label: 'Purchased' },
  { value: 'tracked', label: 'Tracked' },
];

const STATUS_OPTIONS = [
  { value: 'SUGGESTED', label: 'Suggested match' },
  { value: 'READY_TO_IMPORT', label: 'Ready to import' },
  { value: 'LINKED', label: 'Already linked' },
  { value: 'CONFLICT', label: 'Conflict' },
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'NOT_SOLD', label: 'Not sold' },
  { value: 'INACTIVE', label: 'No longer in provider' },
];

function buildApiParams(filters: ActiveFilter[], cursor: string | undefined): AccountingProductListParams {
  const params: AccountingProductListParams = { limit: 20, cursor };
  for (const f of filters) {
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.field === 'status') params.status = values as AccountingProductListParams['status'];
    else if (f.field === 'type') params.type = values as AccountingProductListParams['type'];
    else if (f.field === 'search') params.search = f.value as string;
  }
  return params;
}

// Same status/type/search extraction as buildApiParams, minus pagination —
// the shape a "select all matching filters" bulk import queues against.
function buildSelectionFilter(filters: ActiveFilter[]): { status?: AccountingProductListParams['status']; type?: AccountingProductListParams['type']; search?: string } {
  const filter: { status?: AccountingProductListParams['status']; type?: AccountingProductListParams['type']; search?: string } = {};
  for (const f of filters) {
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.field === 'status') filter.status = values as AccountingProductListParams['status'];
    else if (f.field === 'type') filter.type = values as AccountingProductListParams['type'];
    else if (f.field === 'search') filter.search = f.value as string;
  }
  return filter;
}

export function ProductsTab({ token, providerLabel, onProductsChanged }: Props) {
  const filterFields = useMemo<FilterFieldConfig[]>(
    () => [
      { field: 'search', label: 'Name', operators: [{ value: 'contains', label: 'contains' }], valueKind: 'text' },
      { field: 'type', label: 'Type', operators: [{ value: 'is', label: 'is' }], valueKind: 'multi-select', options: TYPE_OPTIONS },
      { field: 'status', label: 'Status', operators: [{ value: 'is', label: 'is' }], valueKind: 'multi-select', options: STATUS_OPTIONS },
    ],
    [],
  );

  // Default to the two statuses that need attention — a normal, editable
  // FilterBar chip, not a hidden constraint (same pattern as ContactsTab's
  // default).
  const [filters, setFilters] = useState<ActiveFilter[]>([
    { id: 'default-status', field: 'status', operator: 'is', value: ['SUGGESTED', 'READY_TO_IMPORT'] },
  ]);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const buildParams = useCallback((cursor: string | undefined) => buildApiParams(filters, cursor), [filters]);

  const {
    data: products,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token,
    // The accounting client takes (params, token) — reversed from what
    // useCursorList expects — so it needs a thin adapter here.
    fetchPage: (activeToken, params) => adminAccountingApi.listProducts(params, activeToken),
    buildParams,
    errorMessage: 'Failed to load products. Please refresh.',
    deps: [filters, reloadToken],
  });

  // Selection is filter-scoped — a new filter invalidates whatever was
  // selected under the old one.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, [filters]);

  function handleActionComplete() {
    setReloadToken((t) => t + 1);
    onProductsChanged?.();
  }

  function handleToggleRow(id: string) {
    if (selectAllMatching) {
      setSelectAllMatching(false);
      setSelectedIds(new Set(products.filter((p) => p.id !== id).map((p) => p.id)));
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAllLoaded(checked: boolean) {
    setSelectAllMatching(false);
    setSelectedIds(checked ? new Set(products.map((p) => p.id)) : new Set());
  }

  function handleSelectAllMatching() {
    setSelectAllMatching(true);
  }

  function handleBulkImportQueued() {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <FilterBar
          fields={filterFields}
          filters={filters}
          onFiltersChange={setFilters}
          onClearAll={() => setFilters([])}
        />
        <BulkImportControl
          token={token}
          entityLabel="products"
          selectedCount={selectAllMatching ? total : selectedIds.size}
          buildDto={(honourSuggestions) => ({
            ...(selectAllMatching ? { filter: buildSelectionFilter(filters) } : { ids: [...selectedIds] }),
            honourSuggestions,
          })}
          bulkImport={(dto, activeToken) => adminAccountingApi.bulkImportProducts(dto, activeToken)}
          onQueued={handleBulkImportQueued}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : (
        <AccountingProductsTable
          products={products}
          loading={isLoading}
          hasFilter={filters.length > 0}
          token={token}
          providerLabel={providerLabel}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          onActionComplete={handleActionComplete}
          selectedIds={selectedIds}
          selectAllMatching={selectAllMatching}
          total={total}
          onToggleRow={handleToggleRow}
          onToggleAllLoaded={handleToggleAllLoaded}
          onSelectAllMatching={handleSelectAllMatching}
        />
      )}
    </div>
  );
}
