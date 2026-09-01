'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { DistributorCard } from '@/components/DistributorCard';
import { portalApi } from '@wholo/api-client';
import { PageShell } from '@/components/PageShell';
import { SearchInput } from '@/components/SearchInput';
import { Eyebrow } from '@/components/Eyebrow';
import { Button } from '@/components/Button';
import type { PortalDistributorSummary } from '@wholo/types';

function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

export default function HomePage() {
  const { user, accessToken, isLoading: authLoading, orderAsMode, orderAsDistributorId } = useRequireAuth();
  const [distributors, setDistributors] = useState<PortalDistributorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    portalApi
      .getMyDistributors(accessToken)
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

  return (
    <>
      <PageShell width="full">

        {/* Greeting */}
        <div className="mb-8">
          <Eyebrow className="mb-2">Your account</Eyebrow>
          <h1 className="text-2xl font-semibold text-foreground">
            Hi, {user?.firstName}
          </h1>
        </div>

        {/* My Suppliers */}
        <section className="mb-10">
          <Eyebrow className="mb-2">Your wholesalers</Eyebrow>
          <h2 className="text-base font-semibold text-foreground">My suppliers</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Jump back into an account, or add a new wholesaler you already buy from.
          </p>

          {/* Search */}
          <SearchInput value={query} onChange={setQuery} placeholder="Search suppliers…" className="mb-4 max-w-sm" />

          {/* Cards */}
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-24 bg-surface-hover animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              {query ? (
                <>
                  <p className="text-sm font-medium text-foreground">No suppliers match &ldquo;{query}&rdquo;</p>
                  <p className="mt-1 text-xs text-muted">Try a different search term</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">No suppliers yet</p>
                  <p className="mt-1 text-xs text-muted">
                    Your suppliers will appear here once access is granted
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4">
              {filtered.map((d) => (
                <DistributorCard
                  key={d.id}
                  distributor={d}
                  locked={orderAsMode && d.id !== orderAsDistributorId}
                />
              ))}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="h-px bg-border mb-10" />

        {/* Find new suppliers */}
        <section>
          <Eyebrow className="mb-2">Discover</Eyebrow>
          <h2 className="text-base font-semibold text-foreground mb-1">Find new suppliers</h2>
          <p className="text-sm text-muted mb-4">
            Browse the marketplace to discover distributors and request access
          </p>
          <Button variant="secondary" disabled title="Coming soon">
            <CompassIcon />
            Browse marketplace
          </Button>
        </section>

      </PageShell>
    </>
  );
}
