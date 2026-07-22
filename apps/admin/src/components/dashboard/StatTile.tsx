'use client';

import type { AnalyticsComparison } from '@wholo/types';

interface Props {
  label: string;
  comparison: AnalyticsComparison;
  format?: (value: number) => string;
}

function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString('en-GB');
}

const defaultFormat = (value: number) => compactNumber(value);

// Stat tile contract (dataviz skill): label, value (auto-compact), delta
// signed vs a named period, color = direction (all four dashboard metrics
// are "more is better", so up is always good here). "New"/"Building history"
// are rendered distinctly, never as a misleading 0% or a blank.
export function StatTile({ label, comparison, format = defaultFormat }: Props) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text">{format(comparison.current)}</p>
      <div className="mt-1.5 h-5">
        {comparison.status === 'insufficient_history' && (
          <p className="text-xs font-medium text-muted">Building history</p>
        )}
        {comparison.status === 'new' && (
          <p className="text-xs font-medium text-primary">New</p>
        )}
        {comparison.status === 'value' && comparison.percentageChange !== null && (
          <p className={`text-xs font-medium ${comparison.percentageChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {comparison.percentageChange >= 0 ? '▲' : '▼'} {Math.abs(comparison.percentageChange).toFixed(1)}% vs. previous period
          </p>
        )}
        {comparison.status === 'value' && comparison.percentageChange === null && (
          <p className="text-xs font-medium text-muted">No change vs. previous period</p>
        )}
      </div>
    </div>
  );
}
