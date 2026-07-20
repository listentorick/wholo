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
import { adminCataloguesApi } from '@wholo/admin-api-client';
import type { CatalogueSummary } from '@wholo/types';

// ─── Empty state ──────────────────────────────────────────────────────────────

function CataloguesEmptyState() {
  return (
    <ListEmptyState
      iconBgClassName="bg-accent/10"
      icon={
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <rect x="10" y="8" width="44" height="48" rx="4" className="fill-accent/30" />
          <rect x="10" y="8" width="44" height="10" rx="4" className="fill-accent/50" />
          <rect x="6" y="12" width="6" height="40" rx="3" className="fill-accent" opacity="0.4" />
          <line x1="20" y1="26" x2="44" y2="26" className="stroke-accent" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <line x1="20" y1="32" x2="44" y2="32" className="stroke-accent" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          <line x1="20" y1="38" x2="36" y2="38" className="stroke-accent" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
      }
      title="No catalogues yet"
      description="Catalogues control which products each customer can see. Create one to get started."
      action={
        <Link
          href="/catalogues/new"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Create first catalogue
        </Link>
      }
    />
  );
}

// ─── Catalogue row ────────────────────────────────────────────────────────────

function CatalogueRow({ catalogue }: { catalogue: CatalogueSummary }) {
  const noCustomers = catalogue._count.customers === 0;
  const href = `/catalogues/${catalogue.id}/edit`;
  return (
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
            {catalogue.name}
          </span>
          {catalogue.description && (
            <span className="block text-xs text-muted mt-0.5 truncate max-w-xs">{catalogue.description}</span>
          )}
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href}>
          <span className="text-sm text-text">{catalogue._count.products}</span>
        </ListCellLink>
      </td>
      <td className="py-3 px-4 max-md:pr-5">
        <ListCellLink href={href}>
          {noCustomers ? (
            <StatusBadge label="No customers" tone="yellow" />
          ) : (
            <span className="text-sm text-text">{catalogue._count.customers}</span>
          )}
        </ListCellLink>
      </td>
      <td className="py-3 pl-4 pr-5 text-sm text-muted hidden md:table-cell">
        <ListCellLink href={href}>
          {new Date(catalogue.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </ListCellLink>
      </td>
    </ListRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CataloguesPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const buildParams = useCallback((cursor: string | undefined) => ({ limit: 50, cursor }), []);

  const {
    data: catalogues,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token: accessToken,
    fetchPage: adminCataloguesApi.list,
    buildParams,
    errorMessage: 'Failed to load catalogues. Please refresh.',
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
        title="Catalogues"
        count={!isLoading ? total : undefined}
        actions={
          <Link
            href="/catalogues/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            New catalogue
          </Link>
        }
      />

      {isLoading ? (
        <ListSpinner />
      ) : error ? (
        <ListErrorBanner message={error} />
      ) : catalogues.length === 0 ? (
        <CataloguesEmptyState />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Catalogue</ListTh>
                <ListTh>Products</ListTh>
                <ListTh className="max-md:pr-5">Customers</ListTh>
                <ListTh className="hidden md:table-cell">Created</ListTh>
              </tr>
            </thead>
            <tbody>
              {catalogues.map((catalogue) => (
                <CatalogueRow key={catalogue.id} catalogue={catalogue} />
              ))}
            </tbody>
          </table>
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </AdminLayout>
  );
}
