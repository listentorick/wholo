'use client';

import { useCallback } from 'react';
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
import { StatusBadge } from '@/components/list/StatusBadge';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import type { PriceListSummary } from '@wholo/types';

// ─── Empty state ──────────────────────────────────────────────────────────────

function PriceListsEmptyState() {
  return (
    <ListEmptyState
      iconBgClassName="bg-[#fef3e8]"
      icon={
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <path d="M52 30L34 12H12v22l18 18a4 4 0 005.66 0l16.34-16.34A4 4 0 0052 30z" fill="#f5d9c0" />
          <path d="M52 30L34 12H12v10h22l14 14-1.17 1.17A4 4 0 0052 34.83V30z" fill="#e8b990" />
          <circle cx="21" cy="21" r="3" fill="#d97036" />
        </svg>
      }
      title="No price lists yet"
      description="Price lists let you offer different pricing to different customers. Create one to get started."
      action={
        <Link
          href="/pricelists/new"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Create first price list
        </Link>
      }
    />
  );
}

// ─── Price list row ───────────────────────────────────────────────────────────

function PriceListRow({ priceList }: { priceList: PriceListSummary }) {
  const href = `/pricelists/${priceList.id}/edit`;
  return (
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <div className="flex items-center gap-2">
            <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
              {priceList.name}
            </span>
            {priceList.isDefault && <StatusBadge label="Default" tone="blue" />}
          </div>
          {priceList.description && (
            <span className="block text-xs text-muted mt-0.5 truncate max-w-xs">{priceList.description}</span>
          )}
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href} className="text-sm text-text">
          {priceList.currency}
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href} className="text-sm text-text">
          {priceList._count.rules}
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href}>
          <StatusBadge
            label={priceList.active ? 'Active' : 'Inactive'}
            tone={priceList.active ? 'green' : 'gray'}
          />
        </ListCellLink>
      </td>
      <td className="py-3 pl-4 pr-5 text-sm text-muted">
        <ListCellLink href={href}>
          {new Date(priceList.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </ListCellLink>
      </td>
    </ListRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PriceListsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const buildParams = useCallback((cursor: string | undefined) => ({ limit: 50, cursor }), []);

  const {
    data: priceLists,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token: accessToken,
    fetchPage: adminPriceListsApi.list,
    buildParams,
    errorMessage: 'Failed to load price lists. Please refresh.',
    deps: [],
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
        title="Price lists"
        count={!isLoading ? total : undefined}
        actions={
          <Link
            href="/pricelists/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            New price list
          </Link>
        }
      />

      {isLoading ? (
        <ListSpinner />
      ) : error ? (
        <ListErrorBanner message={error} />
      ) : priceLists.length === 0 ? (
        <PriceListsEmptyState />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Name</ListTh>
                <ListTh>Currency</ListTh>
                <ListTh>Rules</ListTh>
                <ListTh>Status</ListTh>
                <ListTh>Created</ListTh>
              </tr>
            </thead>
            <tbody>
              {priceLists.map((pl) => (
                <PriceListRow key={pl.id} priceList={pl} />
              ))}
            </tbody>
          </table>
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </AdminLayout>
  );
}
