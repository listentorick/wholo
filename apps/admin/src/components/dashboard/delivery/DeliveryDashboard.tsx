'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useDeliveryOverview } from '@/lib/hooks/use-delivery-overview';
import { useDeliveryOutcomes } from '@/lib/hooks/use-delivery-outcomes';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { DashboardBar, type DashboardNav } from '../DashboardBar';
import { AttentionTiles, type QueueFilter } from './AttentionTiles';
import { NeedsDoingTable } from './NeedsDoingTable';
import { OutcomeChart } from './OutcomeChart';
import { TodayProgress } from './TodayProgress';
import { TodayRuns } from './TodayRuns';
import { chartWindow, outcomeBars, timeOfDay } from './delivery';

// "Where are we at right now" for the warehouse. Two independent loads: the live
// snapshot (tiles, progress, runs, queue — one blob so the numbers agree) and the
// last-seven-days history (delivery facts). The chart failing never takes the
// tiles down, and the tiles refreshing never re-fetches history.
export function DeliveryDashboard({ nav }: { nav?: DashboardNav }) {
  const { accessToken } = useAuth();
  const { overview, isLoading, isRefreshing, error, refetch } = useDeliveryOverview(!!accessToken);
  const outcomes = useDeliveryOutcomes(overview ? chartWindow(overview.date) : null);
  const [filter, setFilter] = useState<QueueFilter>('ALL');
  const bars = useMemo(() => (overview && outcomes.data ? outcomeBars(outcomes.data.days, overview) : null), [overview, outcomes.data]);

  if (!overview) {
    if (error) {
      return (
        <div>
          <DashboardBar nav={nav} />
          <div className="space-y-3">
            <ListErrorBanner message={error} />
            <button type="button" onClick={() => void refetch()} className="text-sm font-medium text-primary hover:underline">Try again</button>
          </div>
        </div>
      );
    }
    return (
      <div>
        <DashboardBar nav={nav} />
        <div className="space-y-4" aria-busy={isLoading} aria-label="Loading today's deliveries">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-canvas" />)}
          </div>
          <div className="h-64 animate-pulse rounded-lg border border-border bg-canvas" />
        </div>
      </div>
    );
  }

  const history = outcomes.data?.days.filter((d) => d.date < overview.date) ?? [];

  const controls = (
    <div className="flex items-center gap-3">
      <p className="text-xs text-muted" role="status">
        {error ? `Could not refresh — showing the snapshot from ${timeOfDay(overview.generatedAt, overview.timezone)}.` : `Last updated ${timeOfDay(overview.generatedAt, overview.timezone)}`}
      </p>
      <button
        type="button"
        onClick={() => void refetch()}
        disabled={isRefreshing}
        aria-label="Refresh"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted hover:bg-canvas disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true">
          <polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 11-2.1-9.4L23 10" />
        </svg>
      </button>
    </div>
  );

  return (
    <div>
      <DashboardBar nav={nav} actions={controls} />
      <div className="space-y-4 lg:space-y-6">
      <AttentionTiles counts={overview.counts} generatedAt={overview.generatedAt} active={filter} onSelect={setFilter} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <TodayProgress progress={overview.progress} />
        <TodayRuns runs={overview.runs} timezone={overview.timezone} />
      </div>

      <section className="rounded-lg border border-border bg-white p-5" aria-labelledby="today-history-heading">
        <h2 id="today-history-heading" className="text-sm font-semibold text-text">What happened to planned deliveries</h2>
        <p className="mt-0.5 text-xs text-muted">The last seven days by outcome, and today so far.</p>
        {outcomes.error ? (
          <p className="py-10 text-center text-sm text-muted">{outcomes.error}</p>
        ) : outcomes.isLoading || !bars ? (
          <div className="mt-3 h-56 animate-pulse rounded-md bg-canvas" aria-label="Loading the last seven days" />
        ) : (
          <OutcomeChart bars={bars} history={history} />
        )}
      </section>

      <NeedsDoingTable overview={overview} filter={filter} onFilter={setFilter} />
      </div>
    </div>
  );
}
