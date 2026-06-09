'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminCataloguesApi } from '@wholo/admin-api-client';
import type { CatalogueSummary } from '@wholo/types';

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-20 px-8 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-[#fef3e8]">
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <rect x="10" y="8" width="44" height="48" rx="4" fill="#f5d9c0" />
          <rect x="10" y="8" width="44" height="10" rx="4" fill="#e8b990" />
          <rect x="6" y="12" width="6" height="40" rx="3" fill="#d97036" opacity="0.4" />
          <line x1="20" y1="26" x2="44" y2="26" stroke="#d97036" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <line x1="20" y1="32" x2="44" y2="32" stroke="#d97036" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          <line x1="20" y1="38" x2="36" y2="38" stroke="#d97036" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-text">No catalogues yet</h2>
      <p className="mb-8 max-w-xs text-sm text-muted leading-relaxed">
        Catalogues control which products each customer can see. Create one to get started.
      </p>
      <Link
        href="/catalogues/new"
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
      >
        Create first catalogue
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

// ─── Catalogue row ────────────────────────────────────────────────────────────

function CatalogueRow({ catalogue }: { catalogue: CatalogueSummary }) {
  const noCustomers = catalogue._count.customers === 0;
  return (
    <tr className="group border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer">
      <td className="py-3 pl-5 pr-4">
        <Link href={`/catalogues/${catalogue.id}/edit`} className="block">
          <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
            {catalogue.name}
          </span>
          {catalogue.description && (
            <span className="block text-xs text-muted mt-0.5 truncate max-w-xs">{catalogue.description}</span>
          )}
        </Link>
      </td>
      <td className="py-3 px-4">
        <Link href={`/catalogues/${catalogue.id}/edit`} className="block">
          <span className="text-sm text-text">{catalogue._count.products}</span>
        </Link>
      </td>
      <td className="py-3 px-4">
        <Link href={`/catalogues/${catalogue.id}/edit`} className="block">
          {noCustomers ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: '#fef9c3', color: '#a16207' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
              No customers
            </span>
          ) : (
            <span className="text-sm text-text">{catalogue._count.customers}</span>
          )}
        </Link>
      </td>
      <td className="py-3 pl-4 pr-5 text-sm text-muted">
        <Link href={`/catalogues/${catalogue.id}/edit`} className="block">
          {new Date(catalogue.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Link>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CataloguesPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [catalogues, setCatalogues] = useState<CatalogueSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCatalogues = useCallback(async (token: string, nextCursor?: string, append = false) => {
    try {
      const result = await adminCataloguesApi.list(token, { limit: 50, cursor: nextCursor });
      setCatalogues((prev) => append ? [...prev, ...result.data] : result.data);
      setCursor(result.pagination.nextCursor ?? undefined);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
    } catch {
      setError('Failed to load catalogues. Please refresh.');
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    setIsLoading(true);
    loadCatalogues(accessToken).finally(() => setIsLoading(false));
  }, [accessToken, loadCatalogues]);

  async function handleLoadMore() {
    if (!accessToken || !cursor) return;
    setIsLoadingMore(true);
    await loadCatalogues(accessToken, cursor, true);
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
          <h1 className="text-xl font-semibold text-text">Catalogues</h1>
          {!isLoading && total > 0 && (
            <p className="mt-0.5 text-sm text-muted">{total} catalogue{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Link
          href="/catalogues/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          New catalogue
        </Link>
      </div>

      {/* Content */}
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : catalogues.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <th className="py-2.5 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Catalogue
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Products
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Customers
                </th>
                <th className="py-2.5 pl-4 pr-5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {catalogues.map((catalogue) => (
                <CatalogueRow key={catalogue.id} catalogue={catalogue} />
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
