'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
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

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-20 px-8 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-[#eef2ff]">
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <circle cx="32" cy="28" r="14" fill="#c7d2fe" />
          <polyline points="32 21 32 28 36 32" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-text">No delivery profiles yet</h2>
      <p className="mb-8 max-w-xs text-sm text-muted leading-relaxed">
        Create a delivery profile to control which delivery dates are available for your customers.
      </p>
      <Link
        href="/delivery-profiles/new"
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
      >
        Create your first profile
      </Link>
    </div>
  );
}

export default function DeliveryProfilesPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [profiles, setProfiles] = useState<DeliveryProfileSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async (token: string, nextCursor?: string, append = false) => {
    try {
      const result = await adminDeliveryProfilesApi.list(token, { limit: 20, cursor: nextCursor });
      setProfiles((prev) => (append ? [...prev, ...result.data] : result.data));
      setCursor(result.pagination.nextCursor ?? undefined);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
    } catch {
      setError('Failed to load delivery profiles. Please refresh.');
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    setIsLoading(true);
    loadProfiles(accessToken).finally(() => setIsLoading(false));
  }, [accessToken, loadProfiles]);

  async function handleLoadMore() {
    if (!accessToken || !cursor) return;
    setIsLoadingMore(true);
    await loadProfiles(accessToken, cursor, true);
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
          <h1 className="text-xl font-semibold text-text">Delivery Profiles</h1>
          {!isLoading && total > 0 && (
            <p className="mt-0.5 text-sm text-muted">{total} profile{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Link
          href="/delivery-profiles/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          New profile
        </Link>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <th className="py-2.5 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">Profile</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Delivery days</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Customers</th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="py-2.5 pl-4 pr-5 text-xs font-semibold uppercase tracking-wide text-muted" />
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors">
                  <td className="py-3 pl-5 pr-4">
                    <Link href={`/delivery-profiles/${profile.id}/edit`} className="block">
                      <span className="font-medium text-text text-sm hover:text-primary transition-colors">{profile.name}</span>
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">
                    {weekdaysLabel(profile.defaultWeekdays)}
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">
                    {profile._count.customerSettings}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={
                        profile.active
                          ? { backgroundColor: '#dcfce7', color: '#15803d' }
                          : { backgroundColor: '#f3f4f6', color: '#6b7280' }
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: profile.active ? '#15803d' : '#6b7280' }}
                      />
                      {profile.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 pl-4 pr-5 text-right">
                    <Link
                      href={`/delivery-profiles/${profile.id}/edit`}
                      className="text-sm text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
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
