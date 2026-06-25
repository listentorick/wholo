'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { DistributorCard } from '@/components/DistributorCard';
import { portalApi } from '@wholo/api-client';
import type { PortalDistributorSummary } from '@wholo/types';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-muted">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

export default function HomePage() {
  const { user, accessToken, isLoading: authLoading } = useRequireAuth();
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
      <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto w-full">

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            Hi, {user?.firstName} 👋
          </h1>
        </div>

        {/* My Suppliers */}
        <section className="mb-10">
          <h2 className="text-base font-semibold text-foreground mb-4">My Suppliers</h2>

          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suppliers…"
              className="w-full border border-border bg-white py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>

          {/* Cards */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
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
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((d) => (
                <DistributorCard key={d.id} distributor={d} />
              ))}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="h-px bg-border mb-10" />

        {/* Find new suppliers */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-1">Find new suppliers</h2>
          <p className="text-sm text-muted mb-4">
            Browse the marketplace to discover distributors and request access
          </p>
          <button
            disabled
            className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-sm font-medium text-muted cursor-not-allowed"
            title="Coming soon"
          >
            <CompassIcon />
            Browse marketplace
          </button>
        </section>

      </div>
    </>
  );
}
