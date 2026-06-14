'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import type { PriceListSummary } from '@wholo/types';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-20 px-8 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-[#fef3e8]">
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <path d="M52 30L34 12H12v22l18 18a4 4 0 005.66 0l16.34-16.34A4 4 0 0052 30z" fill="#f5d9c0" />
          <path d="M52 30L34 12H12v10h22l14 14-1.17 1.17A4 4 0 0052 34.83V30z" fill="#e8b990" />
          <circle cx="21" cy="21" r="3" fill="#d97036" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-text">No price lists yet</h2>
      <p className="mb-8 max-w-xs text-sm text-muted leading-relaxed">
        Price lists let you offer different pricing to different customers. Create one to get started.
      </p>
      <Link
        href="/pricelists/new"
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
      >
        Create first price list
      </Link>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

function PriceListRow({ priceList }: { priceList: PriceListSummary }) {
  return (
    <tr className="group border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer">
      <td className="py-3 pl-5 pr-4">
        <Link href={`/pricelists/${priceList.id}/edit`} className="block">
          <div className="flex items-center gap-2">
            <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
              {priceList.name}
            </span>
            {priceList.isDefault && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[#dbeafe] text-[#1d4ed8]">
                Default
              </span>
            )}
          </div>
          {priceList.description && (
            <span className="block text-xs text-muted mt-0.5 truncate max-w-xs">{priceList.description}</span>
          )}
        </Link>
      </td>
      <td className="py-3 px-4">
        <Link href={`/pricelists/${priceList.id}/edit`} className="block text-sm text-text">
          {priceList.currency}
        </Link>
      </td>
      <td className="py-3 px-4">
        <Link href={`/pricelists/${priceList.id}/edit`} className="block text-sm text-text">
          {priceList._count.rules}
        </Link>
      </td>
      <td className="py-3 px-4">
        <Link href={`/pricelists/${priceList.id}/edit`} className="block">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={
              priceList.active
                ? { backgroundColor: '#dcfce7', color: '#15803d' }
                : { backgroundColor: '#f3f4f6', color: '#6b7280' }
            }
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: priceList.active ? '#16a34a' : '#9ca3af' }}
            />
            {priceList.active ? 'Active' : 'Inactive'}
          </span>
        </Link>
      </td>
      <td className="py-3 pl-4 pr-5 text-sm text-muted">
        <Link href={`/pricelists/${priceList.id}/edit`} className="block">
          {new Date(priceList.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Link>
      </td>
    </tr>
  );
}

export default function PriceListsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [priceLists, setPriceLists] = useState<PriceListSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPriceLists = useCallback(async (token: string, nextCursor?: string, append = false) => {
    try {
      const result = await adminPriceListsApi.list(token, { limit: 50, cursor: nextCursor });
      setPriceLists((prev) => append ? [...prev, ...result.data] : result.data);
      setCursor(result.pagination.nextCursor ?? undefined);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
    } catch {
      setError('Failed to load price lists. Please refresh.');
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    setIsLoading(true);
    loadPriceLists(accessToken).finally(() => setIsLoading(false));
  }, [accessToken, loadPriceLists]);

  async function handleLoadMore() {
    if (!accessToken || !cursor) return;
    setIsLoadingMore(true);
    await loadPriceLists(accessToken, cursor, true);
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Price lists</h1>
          {!isLoading && total > 0 && (
            <p className="mt-0.5 text-sm text-muted">{total} price list{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Link
          href="/pricelists/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          New price list
        </Link>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : priceLists.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <th className="py-2.5 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">Name</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Currency</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Rules</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="py-2.5 pl-4 pr-5 text-xs font-semibold uppercase tracking-wide text-muted">Created</th>
              </tr>
            </thead>
            <tbody>
              {priceLists.map((pl) => (
                <PriceListRow key={pl.id} priceList={pl} />
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
