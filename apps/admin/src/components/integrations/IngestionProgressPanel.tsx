'use client';

import type { ReactNode } from 'react';
import type { IngestionRunSummary } from '@wholo/types';
import { relativeTime } from '@/lib/date';

interface Props {
  runs: IngestionRunSummary[];
  providerLabel: string;
  // Labels keyed by resourceType, e.g. { contact: 'Contacts', ... }.
  labels: Record<string, string>;
  // full: replaces the tabs/listing (manual sync, first-ever sync).
  // strip: a non-blocking bar above the retained listing (scheduled sync).
  variant?: 'full' | 'strip';
  // When set and every run has finished, the full panel holds on a completed
  // "sync complete" state instead of the screen snapping to the listing.
  // Called with no argument from the footer action (land on the default tab)
  // or with a resourceType from a per-resource "Review" link. Only used by the
  // full variant.
  onViewResults?: (resourceType?: string) => void;
}

const RESOURCE_ORDER = ['contact', 'product', 'tax_type'];
const TERMINAL: IngestionRunSummary['status'][] = ['COMPLETED', 'FAILED'];

function ordered(runs: IngestionRunSummary[]): IngestionRunSummary[] {
  return [...runs].sort(
    (a, b) => RESOURCE_ORDER.indexOf(a.resourceType) - RESOURCE_ORDER.indexOf(b.resourceType),
  );
}

function Spinner({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <span
      className={`${className} shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary`}
      aria-hidden
    />
  );
}

function StatusPill({ status }: { status: IngestionRunSummary['status'] }) {
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-medium text-[#15803d]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Done
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-xs font-medium text-[#b91c1c]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Failed
      </span>
    );
  }
  if (status === 'PROCESSING') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        <Spinner />
        Syncing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-medium text-[#6b7280]">
      Queued
    </span>
  );
}

function ProgressBar({ ratio, done }: { ratio: number | null; done?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-border">
      {ratio == null ? (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
      ) : (
        <div
          className={`h-full rounded-full ${done ? 'bg-[#15803d]' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }}
        />
      )}
    </div>
  );
}

function aggregate(runs: IngestionRunSummary[]) {
  const processed = runs.reduce((s, r) => s + r.recordsProcessed, 0);
  const total = runs.every((r) => r.recordsTotal != null)
    ? runs.reduce((s, r) => s + (r.recordsTotal ?? 0), 0)
    : null;
  const suggestions = runs.reduce((s, r) => s + r.detailCount, 0);
  const created = runs.reduce((s, r) => s + r.recordsCreated, 0);
  const updated = runs.reduce((s, r) => s + r.recordsUpdated, 0);
  const removed = runs.reduce((s, r) => s + r.recordsRemoved, 0);
  const unchanged = Math.max(0, processed - created - updated);
  const failed = runs.filter((r) => r.status === 'FAILED');
  const startedTimes = runs
    .map((r) => new Date(r.startedAt ?? r.queuedAt).getTime())
    .filter((n) => Number.isFinite(n));
  const startedAt = startedTimes.length ? new Date(Math.min(...startedTimes)).toISOString() : null;
  const finishedTimes = runs
    .map((r) => (r.finishedAt ? new Date(r.finishedAt).getTime() : NaN))
    .filter((n) => Number.isFinite(n));
  const finishedAt = finishedTimes.length ? new Date(Math.max(...finishedTimes)).toISOString() : null;
  return { processed, total, suggestions, created, updated, removed, unchanged, failed, startedAt, finishedAt };
}

// created + updated + removed for one run — what its "Review" link opens.
function runChangeCount(run: IngestionRunSummary): number {
  return run.recordsCreated + run.recordsUpdated + run.recordsRemoved;
}

function ResourceRows({ runs, labels }: { runs: IngestionRunSummary[]; labels: Record<string, string> }) {
  return (
    <div className="mt-6 border-t border-border">
      {ordered(runs).map((run) => {
        const rowRatio =
          run.recordsTotal != null && run.recordsTotal > 0
            ? run.recordsProcessed / run.recordsTotal
            : run.status === 'COMPLETED'
              ? 1
              : null;
        return (
          <div
            key={run.id}
            className="grid grid-cols-[130px_1fr_auto] items-center gap-4 border-b border-border py-4 last:border-b-0"
          >
            <span className="text-sm font-medium text-text">{labels[run.resourceType] ?? run.resourceType}</span>
            <div className="min-w-0">
              <ProgressBar ratio={rowRatio} done={run.status === 'COMPLETED'} />
              {run.status === 'FAILED' && run.errorMessage && (
                <p className="mt-1 truncate text-xs text-[#b91c1c]">{run.errorMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="w-20 text-right text-xs tabular-nums text-muted">
                {run.recordsProcessed}
                {run.recordsTotal != null ? ` / ${run.recordsTotal}` : ' / …'}
              </span>
              <StatusPill status={run.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Segmented new / updated / removed / unchanged bar for the completed panel.
function ChangeSummaryBar({
  created,
  updated,
  removed,
  unchanged,
}: {
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
}) {
  const denom = created + updated + removed + unchanged || 1;
  const pct = (n: number) => `${(n / denom) * 100}%`;
  const nothingChanged = created + updated + removed === 0;
  return (
    <>
      <div className="flex h-2 overflow-hidden rounded-full bg-border">
        {created > 0 && <span className="bg-[#15803d]" style={{ width: pct(created) }} />}
        {updated > 0 && <span className="bg-accent" style={{ width: pct(updated) }} />}
        {removed > 0 && <span className="bg-[#b91c1c]" style={{ width: pct(removed) }} />}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {nothingChanged ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-[#15803d]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            0 new · 0 updated · 0 removed
          </span>
        ) : (
          <>
            {created > 0 && (
              <span className="inline-flex items-center gap-1.5 text-text">
                <i className="h-2 w-2 rounded-[2px] bg-[#15803d]" />
                {created} new
              </span>
            )}
            {updated > 0 && (
              <span className="inline-flex items-center gap-1.5 text-text">
                <i className="h-2 w-2 rounded-[2px] bg-accent" />
                {updated} updated
              </span>
            )}
            {removed > 0 && (
              <span className="inline-flex items-center gap-1.5 text-text">
                <i className="h-2 w-2 rounded-[2px] bg-[#b91c1c]" />
                {removed} removed
              </span>
            )}
          </>
        )}
        {unchanged > 0 && (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <i className="h-2 w-2 rounded-[2px] bg-border" />
            {unchanged} unchanged
          </span>
        )}
      </div>
    </>
  );
}

function DeltaChip({ tone, children }: { tone: 'new' | 'upd' | 'rem'; children: ReactNode }) {
  const cls = {
    new: 'bg-[#dcfce7] text-[#15803d]',
    upd: 'bg-[#fef3ec] text-[#b45309]',
    rem: 'bg-[#fee2e2] text-[#b91c1c]',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>
      {children}
    </span>
  );
}

// One resource's line on the completed panel: name, its delta chips, and a
// "Review N" link into that resource's tab. Unchanged resources still get a row
// (dimmed, "No changes") so the all-clear reads as "we checked all three".
function ReviewRow({ run, label, onReview }: { run: IngestionRunSummary; label: string; onReview: () => void }) {
  const failed = run.status === 'FAILED';
  const count = runChangeCount(run);
  const unchanged = !failed && count === 0;
  return (
    <div
      className={`grid grid-cols-[130px_1fr_auto] items-center gap-4 border-b border-border py-3.5 last:border-b-0 ${
        unchanged ? 'opacity-60' : ''
      }`}
    >
      <span className="text-sm font-medium text-text">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {failed ? (
          <span className="text-sm text-[#b91c1c]">{run.errorMessage ?? "Couldn't finish"}</span>
        ) : unchanged ? (
          <span className="text-sm text-muted">No changes</span>
        ) : (
          <>
            {run.recordsCreated > 0 && <DeltaChip tone="new">+{run.recordsCreated} new</DeltaChip>}
            {run.recordsUpdated > 0 && <DeltaChip tone="upd">{run.recordsUpdated} updated</DeltaChip>}
            {run.recordsRemoved > 0 && <DeltaChip tone="rem">−{run.recordsRemoved} removed</DeltaChip>}
          </>
        )}
      </div>
      {unchanged ? (
        <span className="whitespace-nowrap text-xs text-muted">Up to date</span>
      ) : (
        !failed &&
        count > 0 && (
          <button
            type="button"
            onClick={onReview}
            className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-primary hover:underline"
          >
            Review {count}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )
      )}
    </div>
  );
}

export function IngestionProgressPanel({ runs, providerLabel, labels, variant = 'full', onViewResults }: Props) {
  const { processed, total, suggestions, created, updated, removed, unchanged, failed, startedAt, finishedAt } =
    aggregate(runs);
  const ratio = total != null && total > 0 ? processed / total : null;
  const allDone = runs.length > 0 && runs.every((r) => TERMINAL.includes(r.status));

  if (variant === 'strip') {
    return (
      <div className="mb-4 rounded-lg border border-border bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Spinner className="h-3.5 w-3.5" />
          <span className="text-sm font-medium text-text">Syncing with {providerLabel}…</span>
          <span className="text-xs text-muted">
            {processed}
            {total != null ? ` of ~${total}` : ''} records · updates live
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar ratio={ratio} />
        </div>
      </div>
    );
  }

  // ── Completed: hold here on the "sync complete" review summary ──
  if (allDone && onViewResults) {
    const hasFailure = failed.length > 0;
    const totalChanges = created + updated + removed;
    // With changes: only the resources that moved (plus any failure). All clear:
    // every resource, so it reads as "we checked all three and nothing moved".
    const rowRuns =
      totalChanges > 0 || hasFailure
        ? ordered(runs).filter((r) => runChangeCount(r) > 0 || r.status === 'FAILED')
        : ordered(runs);

    return (
      <div className="rounded-lg border border-border bg-white p-7">
        <div className="flex items-start gap-3.5">
          <span className="relative h-9 w-9 shrink-0" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/xero.png" alt="" className="h-9 w-9 rounded-full" />
            <span
              className={[
                'absolute -bottom-0.5 -right-0.5 flex h-[17px] w-[17px] items-center justify-center rounded-full border-2 border-white text-white',
                hasFailure ? 'bg-[#b91c1c]' : 'bg-[#15803d]',
              ].join(' ')}
            >
              {hasFailure ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} className="h-2.5 w-2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} className="h-2.5 w-2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">
              {hasFailure ? 'Sync finished with issues' : 'Sync complete'}
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted">
              {totalChanges === 0 && !hasFailure ? (
                <>
                  Stocdup checked all {processed} record{processed === 1 ? '' : 's'} in {providerLabel}.{' '}
                  <span className="font-semibold text-text">Nothing was added, changed or removed</span> — your Stocdup
                  data already matches {providerLabel}.
                </>
              ) : (
                <>
                  Stocdup checked {providerLabel} and found{' '}
                  {created + updated > 0 && (
                    <span className="font-semibold text-text">
                      {created + updated} new or updated record{created + updated === 1 ? '' : 's'}
                    </span>
                  )}
                  {created + updated > 0 && removed > 0 && ', and '}
                  {removed > 0 && (
                    <>
                      <span className="font-semibold text-text">{removed}</span> removed in {providerLabel}
                    </>
                  )}
                  . Nothing has been imported into Stocdup yet — review the changes and import the records you want.
                </>
              )}
              {hasFailure && (
                <>
                  {' '}
                  {failed.map((f) => labels[f.resourceType] ?? f.resourceType).join(' and ')} couldn&apos;t finish.
                </>
              )}
            </p>
          </div>
        </div>

        {!hasFailure && (
          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-text">Records checked</span>
              <span className="text-xs tabular-nums text-muted">
                {processed} checked · {totalChanges === 0 ? 'all up to date' : `${unchanged} unchanged`}
              </span>
            </div>
            <ChangeSummaryBar created={created} updated={updated} removed={removed} unchanged={unchanged} />
          </div>
        )}

        {rowRuns.length > 0 && (
          <div className="mt-6 border-t border-border">
            {rowRuns.map((run) => (
              <ReviewRow
                key={run.id}
                run={run}
                label={labels[run.resourceType] ?? run.resourceType}
                onReview={() => onViewResults(run.resourceType)}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => onViewResults()}
            className={
              totalChanges > 0
                ? 'rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                : 'rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
            }
          >
            {totalChanges > 0 ? `Review ${totalChanges} change${totalChanges === 1 ? '' : 's'}` : 'View synced data'}
          </button>
          {finishedAt && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 15" />
              </svg>
              Finished {relativeTime(finishedAt)}
            </span>
          )}
          {suggestions > 0 && (
            <span className="text-xs text-muted">
              {suggestions} suggested match{suggestions === 1 ? '' : 'es'} to review
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── In progress ──
  return (
    <div className="rounded-lg border border-border bg-white p-7">
      <div className="flex items-start gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/xero.png" alt="" className="h-9 w-9 shrink-0 rounded-full" />
        <div>
          <h2 className="text-base font-semibold text-text">Syncing with {providerLabel}</h2>
          <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted">
            Pulling your contacts, products and tax types from {providerLabel}. Nothing is imported
            automatically — you review and import once the sync finishes.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium text-text">Overall progress</span>
          <span className="text-xs text-muted">
            {processed}
            {total != null ? ` of ~${total}` : ''} records
          </span>
        </div>
        <ProgressBar ratio={ratio} />
      </div>

      <ResourceRows runs={runs} labels={labels} />

      {startedAt && (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 15" />
          </svg>
          Started {relativeTime(startedAt)} · updates live. You can leave this page and come back.
        </p>
      )}
    </div>
  );
}
