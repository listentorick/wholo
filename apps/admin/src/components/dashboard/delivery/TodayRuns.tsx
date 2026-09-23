import Link from 'next/link';
import type { DeliveryOverview } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { runStatus, timeOfDay } from './delivery';

export function TodayRuns({ runs, timezone }: { runs: DeliveryOverview['runs']; timezone: string }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5" aria-labelledby="today-runs-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="today-runs-heading" className="text-sm font-semibold text-text">Today&rsquo;s runs</h2>
          <p className="mt-0.5 text-xs text-muted">Stops attempted so far on each run.</p>
        </div>
        <Link href="/delivery-runs" className="shrink-0 text-xs font-medium text-primary hover:underline">View all runs &rsaquo;</Link>
      </div>

      {runs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No runs planned for today.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {runs.map((run) => {
            const status = runStatus(run);
            const percent = run.stopCount === 0 ? 0 : Math.round((run.attemptedCount / run.stopCount) * 100);
            return (
              <li key={run.runId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[9rem_1fr_5rem_7.5rem]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{run.name}</p>
                  <p className="truncate text-xs text-muted">{run.driverName ?? 'No driver yet'}</p>
                </div>
                <div className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-gray-200 sm:order-none sm:col-span-1" role="progressbar" aria-label={`${run.name} progress`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-green-600" style={{ width: `${percent}%` }} />
                </div>
                <p className="hidden text-right text-xs tabular-nums text-muted sm:block">
                  <span className="font-semibold text-text">{run.attemptedCount}</span> / {run.stopCount} stops
                </p>
                <div className="flex flex-col items-end gap-1 text-xs text-muted">
                  <StatusBadge label={status.label} tone={status.tone} />
                  <span>{run.lastDropAt ? `Last drop ${timeOfDay(run.lastDropAt, timezone)}` : run.status === 'READY' ? 'Not started' : 'Not ready yet'}</span>
                  <span className="sm:hidden">{run.attemptedCount} / {run.stopCount} stops</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
