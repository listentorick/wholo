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
import { adminDeliveryRoutesApi } from '@wholo/admin-api-client';
import type { DeliveryRouteSummary } from '@wholo/types';

// ─── Empty state ──────────────────────────────────────────────────────────────

function DeliveryRoutesEmptyState() {
  return (
    <ListEmptyState
      icon={
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <circle cx="18" cy="48" r="7" className="fill-primary/40" />
          <circle cx="46" cy="16" r="7" className="fill-primary/40" />
          <path d="M22 43L42 21" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
        </svg>
      }
      title="No delivery routes yet"
      description="Create a route to group customers who normally travel together, and set their usual drop order."
      action={
        <Link
          href="/delivery-routes/new"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Create your first route
        </Link>
      }
    />
  );
}

// ─── Delivery route row ───────────────────────────────────────────────────────

function DeliveryRouteRow({ route }: { route: DeliveryRouteSummary }) {
  const href = `/delivery-routes/${route.id}/edit`;
  return (
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <span className="font-medium text-text text-sm group-hover:text-primary transition-colors">
            {route.name}
          </span>
        </ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted hidden md:table-cell">
        <ListCellLink href={href}>{route.code ?? '—'}</ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted hidden md:table-cell">
        <ListCellLink href={href}>{route.defaultDriverName ?? '—'}</ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <ListCellLink href={href}>{route.customerCount}</ListCellLink>
      </td>
      <td className="py-3 pl-4 pr-5">
        <ListCellLink href={href}>
          <StatusBadge label={route.active ? 'Active' : 'Inactive'} tone={route.active ? 'green' : 'gray'} />
        </ListCellLink>
      </td>
    </ListRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryRoutesPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const buildParams = useCallback((cursor: string | undefined) => ({ limit: 20, cursor }), []);

  const {
    data: routes,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token: accessToken,
    fetchPage: adminDeliveryRoutesApi.list,
    buildParams,
    errorMessage: 'Failed to load delivery routes. Please refresh.',
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
        title="Delivery Routes"
        count={!isLoading ? total : undefined}
        actions={
          <Link
            href="/delivery-routes/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            New route
          </Link>
        }
      />

      {isLoading ? (
        <ListSpinner />
      ) : error ? (
        <ListErrorBanner message={error} />
      ) : routes.length === 0 ? (
        <DeliveryRoutesEmptyState />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Route</ListTh>
                <ListTh className="hidden md:table-cell">Code</ListTh>
                <ListTh className="hidden md:table-cell">Default driver</ListTh>
                <ListTh>Customers</ListTh>
                <ListTh>Status</ListTh>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <DeliveryRouteRow key={route.id} route={route} />
              ))}
            </tbody>
          </table>
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </AdminLayout>
  );
}
