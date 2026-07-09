'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingProductStatus, AccountingProductSummary, AccountingProductType } from '@wholo/types';
import { AccountingProductsTable } from './AccountingProductsTable';
import { SyncNowButton } from './SyncNowButton';

interface Props {
  token: string;
  onProductsChanged?: () => void;
}

const STATUS_OPTIONS: { value: AccountingProductStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'SUGGESTED', label: 'Suggested match' },
  { value: 'READY_TO_IMPORT', label: 'Ready to import' },
  { value: 'LINKED', label: 'Already linked' },
  { value: 'CONFLICT', label: 'Conflict' },
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'NOT_SOLD', label: 'Not sold' },
  { value: 'INACTIVE', label: 'No longer in provider' },
];

// The provider's own item flags (Xero: sold/purchased/tracked) — composes
// with the match-status filter above rather than replacing it.
const TYPE_OPTIONS: { value: AccountingProductType | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'sold', label: 'Sold' },
  { value: 'purchased', label: 'Purchased' },
  { value: 'tracked', label: 'Tracked' },
];

export function ProductsTab({ token, onProductsChanged }: Props) {
  const [products, setProducts] = useState<AccountingProductSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountingProductStatus | ''>('');
  const [type, setType] = useState<AccountingProductType | ''>('');

  const load = useCallback(
    async (append: boolean, nextCursor?: string) => {
      try {
        const res = await adminAccountingApi.listProducts(
          { limit: 20, cursor: nextCursor, status: status || undefined, type: type || undefined },
          token,
        );
        setProducts((prev) => (append ? [...prev, ...res.data] : res.data));
        setCursor(res.pagination.nextCursor ?? undefined);
        setHasMore(res.pagination.hasMore);
      } catch {
        setError('Failed to load products. Please refresh.');
      }
    },
    [token, status, type],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    setCursor(undefined);
    load(false).finally(() => setLoading(false));
  }, [load]);

  function handleActionComplete() {
    load(false);
    onProductsChanged?.();
  }

  async function handleLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    await load(true, cursor);
    setLoadingMore(false);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SyncNowButton token={token} onQueued={onProductsChanged} />
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter by type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountingProductType | '')}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as AccountingProductStatus | '')}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <AccountingProductsTable
            products={products}
            loading={loading}
            hasFilter={status !== '' || type !== ''}
            token={token}
            onActionComplete={handleActionComplete}
          />
          {hasMore && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
