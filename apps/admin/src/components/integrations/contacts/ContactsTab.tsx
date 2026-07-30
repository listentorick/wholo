'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingContactListParams } from '@wholo/types';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { FilterBar } from '@/components/list/filter-bar/FilterBar';
import type { ActiveFilter, FilterFieldConfig } from '@/components/list/filter-bar/types';
import { BulkImportControl } from '@/components/integrations/BulkImportControl';
import { AccountingContactsTable } from './AccountingContactsTable';

interface Props {
  token: string;
  providerLabel: string;
  onContactsChanged?: () => void;
}

const TYPE_OPTIONS = [
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_OPTIONS = [
  { value: 'SUGGESTED', label: 'Suggested match' },
  { value: 'READY_TO_IMPORT', label: 'Ready to import' },
  { value: 'LINKED', label: 'Already linked' },
  { value: 'CONFLICT', label: 'Conflict' },
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'NOT_A_CUSTOMER', label: 'Not a customer' },
  { value: 'ARCHIVED', label: 'Archived' },
];

function buildApiParams(filters: ActiveFilter[], cursor: string | undefined): AccountingContactListParams {
  const params: AccountingContactListParams = { limit: 20, cursor };
  for (const f of filters) {
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.field === 'status') params.status = values as AccountingContactListParams['status'];
    else if (f.field === 'type') params.type = values as AccountingContactListParams['type'];
    else if (f.field === 'search') params.search = f.value as string;
  }
  return params;
}

// Same status/type/search extraction as buildApiParams, minus pagination —
// the shape a "select all matching filters" bulk import queues against.
function buildSelectionFilter(filters: ActiveFilter[]): { status?: AccountingContactListParams['status']; type?: AccountingContactListParams['type']; search?: string } {
  const filter: { status?: AccountingContactListParams['status']; type?: AccountingContactListParams['type']; search?: string } = {};
  for (const f of filters) {
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.field === 'status') filter.status = values as AccountingContactListParams['status'];
    else if (f.field === 'type') filter.type = values as AccountingContactListParams['type'];
    else if (f.field === 'search') filter.search = f.value as string;
  }
  return filter;
}

export function ContactsTab({ token, providerLabel, onContactsChanged }: Props) {
  const filterFields = useMemo<FilterFieldConfig[]>(
    () => [
      { field: 'search', label: 'Name', operators: [{ value: 'contains', label: 'contains' }], valueKind: 'text' },
      { field: 'type', label: 'Type', operators: [{ value: 'is', label: 'is' }], valueKind: 'multi-select', options: TYPE_OPTIONS },
      { field: 'status', label: 'Status', operators: [{ value: 'is', label: 'is' }], valueKind: 'multi-select', options: STATUS_OPTIONS },
    ],
    [],
  );

  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const buildParams = useCallback((cursor: string | undefined) => buildApiParams(filters, cursor), [filters]);

  const {
    data: contacts,
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
    fetchPage: (activeToken, params) => adminAccountingApi.listContacts(params, activeToken),
    buildParams,
    errorMessage: 'Failed to load contacts. Please refresh.',
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
    onContactsChanged?.();
  }

  function handleToggleRow(id: string) {
    if (selectAllMatching) {
      setSelectAllMatching(false);
      setSelectedIds(new Set(contacts.filter((c) => c.id !== id).map((c) => c.id)));
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
    setSelectedIds(checked ? new Set(contacts.map((c) => c.id)) : new Set());
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
          entityLabel="contacts"
          selectedCount={selectAllMatching ? total : selectedIds.size}
          buildDto={(honourSuggestions) => ({
            ...(selectAllMatching ? { filter: buildSelectionFilter(filters) } : { ids: [...selectedIds] }),
            honourSuggestions,
          })}
          bulkImport={(dto, activeToken) => adminAccountingApi.bulkImportContacts(dto, activeToken)}
          onQueued={handleBulkImportQueued}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : (
        <AccountingContactsTable
          contacts={contacts}
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
