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
import { adminDeliveryProfilesApi } from '@wholo/admin-api-client';
import type { DeliveryProfileSummary } from '@wholo/types';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdaysLabel(days: number[]) {
  if (days.length === 0) return '—';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(', ');
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function DeliveryProfilesEmptyState() {
  return (
    <ListEmptyState
      icon={
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <circle cx="32" cy="28" r="14" className="fill-primary/40" />
          <polyline points="32 21 32 28 36 32" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
      title="No delivery profiles yet"
      description="Create a delivery profile to control which delivery dates are available for your customers."
      action={
        <Link
          href="/delivery-profiles/new"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Create your first profile
        </Link>
      }
    />
  );
}

// ─── Delivery profile row ─────────────────────────────────────────────────────
// Whole-row-click to edit, matching every other list page — previously this
// was the one page using a plain (non-clickable) row with a trailing "Edit"
// link column instead.

function DeliveryProfileRow({ profile }: { profile: DeliveryProfileSummary }) {
  const href = `/delivery-profiles/${profile.id}/edit`;
  return (
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <span className="font-medium text-text text-sm group-hover:text-primary transition-colors">
            {profile.name}
          </span>
        </ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted hidden md:table-cell">
        <ListCellLink href={href}>{weekdaysLabel(profile.defaultWeekdays)}</ListCellLink>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <ListCellLink href={href}>{profile._count.customerSettings}</ListCellLink>
      </td>
      <td className="py-3 pl-4 pr-5">
        <ListCellLink href={href}>
          <StatusBadge label={profile.active ? 'Active' : 'Inactive'} tone={profile.active ? 'green' : 'gray'} />
        </ListCellLink>
      </td>
    </ListRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryProfilesPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const buildParams = useCallback((cursor: string | undefined) => ({ limit: 20, cursor }), []);

  const {
    data: profiles,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token: accessToken,
    fetchPage: adminDeliveryProfilesApi.list,
    buildParams,
    errorMessage: 'Failed to load delivery profiles. Please refresh.',
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
        title="Delivery Profiles"
        count={!isLoading ? total : undefined}
        actions={
          <Link
            href="/delivery-profiles/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            New profile
          </Link>
        }
      />

      {isLoading ? (
        <ListSpinner />
      ) : error ? (
        <ListErrorBanner message={error} />
      ) : profiles.length === 0 ? (
        <DeliveryProfilesEmptyState />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Profile</ListTh>
                <ListTh className="hidden md:table-cell">Delivery days</ListTh>
                <ListTh>Customers</ListTh>
                <ListTh>Status</ListTh>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <DeliveryProfileRow key={profile.id} profile={profile} />
              ))}
            </tbody>
          </table>
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </AdminLayout>
  );
}
