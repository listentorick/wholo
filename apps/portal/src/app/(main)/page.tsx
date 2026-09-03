'use client';

import { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { ChevronRight, Compass, Search } from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { DistributorCard } from '@/components/DistributorCard';
import { RecommendedSuppliers } from '@/components/home/RecommendedSuppliers';
import { portalApi } from '@wholo/api-client';
import { PageShell } from '@/components/PageShell';
import { SearchInput } from '@/components/SearchInput';
import { Eyebrow } from '@/components/Eyebrow';
import type { PortalDistributorSummary } from '@wholo/types';

/** Above this many suppliers, offer the small name filter over the stack. */
const SECONDARY_FILTER_THRESHOLD = 6;

/**
 * The prominent discovery search from the design. Product + supplier search is a
 * greenfield feature, so this is a deliberately inert stand-in — a styled `<div>`,
 * never an `<input>`, so it cannot be focused, typed into, or submitted.
 */
function SupplierSearchPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={clsx('hm-rise flex items-stretch gap-2', className)}
      style={{ animationDelay: '0.06s' }}
      aria-hidden="true"
    >
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
          <Search className="h-4 w-4" />
        </span>
        <div className="w-full rounded-md border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-muted">
          Search products or suppliers
        </div>
      </div>
      <div className="flex w-11 items-center justify-center rounded-md bg-accent text-white">
        <Search className="h-4 w-4" />
      </div>
    </div>
  );
}

/** Reserved merchandising slot — no promo/featured-range feature exists yet. */
function MerchandisingBand({ className }: { className?: string }) {
  return (
    <section
      className={clsx(
        'hm-rise min-h-[160px] rounded-lg border border-border bg-surface-highlight p-5',
        className,
      )}
      style={{ animationDelay: '0.12s' }}
    >
      <h2 className="text-base font-semibold text-foreground">Seasonal ranges &amp; new arrivals</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Featured ranges and offers from your suppliers appear here.
      </p>
    </section>
  );
}

/** Shown only for customers with a handful of suppliers — a "more to come" cue. */
function EmptySupplierSlot({ className }: { className?: string }) {
  return (
    <div
      className={clsx('hm-rise rounded-lg border border-dashed border-border p-5', className)}
      style={{ animationDelay: '0.24s' }}
    >
      <p className="text-sm text-muted">
        Your other suppliers appear here as wholesalers give you access.
      </p>
    </div>
  );
}

/** Entry point to the (not-yet-built) marketplace directory — inert for now. */
function FindSuppliersCard({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'hm-rise flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm',
        className,
      )}
      title="Coming soon"
      style={{ animationDelay: '0.28s' }}
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-accent text-accent">
        <Compass className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">Find new suppliers</span>
        <span className="block text-xs text-muted">
          Discover wholesalers near you and request access — coming soon.
        </span>
      </span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden />
    </div>
  );
}

function SupplierListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[76px] animate-pulse rounded-lg border border-border bg-surface-hover"
        />
      ))}
    </div>
  );
}

function NoSuppliersEmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-8 py-14 text-center shadow-sm"
      style={{ animation: 'hm-fade-up 0.4s ease both 0.1s' }}
    >
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-border text-border">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} className="h-6 w-6">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-foreground">No suppliers yet</p>
        <p className="text-xs text-muted">
          Suppliers appear here once a wholesaler grants you access.
        </p>
      </div>
    </div>
  );
}

function NoFilterMatchEmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-8 py-12 text-center shadow-sm">
      <p className="text-sm font-medium text-foreground">No suppliers match &ldquo;{query}&rdquo;</p>
      <p className="mt-1 text-xs text-muted">Try a different search term</p>
    </div>
  );
}

export default function HomePage() {
  const { user, accessToken, isLoading: authLoading, orderAsMode, orderAsDistributorId } =
    useRequireAuth();
  const [distributors, setDistributors] = useState<PortalDistributorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    portalApi
      .getMyDistributors()
      .then(setDistributors)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return distributors;
    return distributors.filter((d) => d.name.toLowerCase().includes(q));
  }, [distributors, query]);

  if (authLoading) return null;

  const hasSecondaryFilter = distributors.length > SECONDARY_FILTER_THRESHOLD;
  const list = hasSecondaryFilter ? filtered : distributors;

  return (
    <>
      <style>{`
        @keyframes hm-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .hm-rise { animation: hm-fade-up 0.32s ease both; }
        @media (prefers-reduced-motion: reduce) { .hm-rise { animation: none; } }
      `}</style>

      <PageShell width="full">
        <div className="flex w-full flex-col gap-8 md:grid md:grid-cols-[420px_minmax(0,1fr)] md:items-start md:gap-10">

          {/* LEFT — the customer's own account */}
          <div className="contents md:flex md:min-w-0 md:flex-col md:gap-8">
            <div className="hm-rise order-1 md:order-none" style={{ animationDelay: '0.02s' }}>
              <Eyebrow className="mb-2">Your account</Eyebrow>
              <h1 className="text-2xl font-semibold text-foreground">Hi, {user?.firstName}</h1>
            </div>

            <section className="order-2 md:order-none">
              <Eyebrow className="mb-3">Your suppliers</Eyebrow>

              {hasSecondaryFilter && (
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Filter your suppliers…"
                  className="mb-3 max-w-xs"
                />
              )}

              {loading ? (
                <SupplierListSkeleton />
              ) : distributors.length === 0 ? (
                <NoSuppliersEmptyState />
              ) : list.length === 0 ? (
                <NoFilterMatchEmptyState query={query} />
              ) : (
                <ul className="flex flex-col gap-3">
                  {list.map((d, i) => (
                    <li
                      key={d.id}
                      className="hm-rise"
                      style={{ animationDelay: `${Math.min(0.06 + i * 0.04, 0.45)}s` }}
                    >
                      <DistributorCard
                        distributor={d}
                        locked={orderAsMode && d.id !== orderAsDistributorId}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {!query && distributors.length >= 1 && distributors.length <= 3 && (
                <EmptySupplierSlot className="mt-3" />
              )}
              {!loading && <FindSuppliersCard className="mt-3" />}
            </section>
          </div>

          {/* RIGHT — discovery (placeholders until the marketplace exists) */}
          <div className="contents md:flex md:min-w-0 md:flex-col md:gap-6">
            <SupplierSearchPlaceholder className="order-3 md:order-none" />
            <MerchandisingBand className="order-4 md:order-none" />
            <RecommendedSuppliers className="order-5 md:order-none" />
          </div>
        </div>
      </PageShell>
    </>
  );
}
