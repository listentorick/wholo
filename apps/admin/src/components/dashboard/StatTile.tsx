'use client';

import type { ReactNode } from 'react';
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

interface FrameProps {
  label: string;
  value: ReactNode;
  footer?: ReactNode;
  /** Makes the tile a toggle button (e.g. a filter). Static tiles render as a plain card. */
  onClick?: () => void;
  selected?: boolean;
}

// The dashboards' stat card: uppercase label, large value, one small line under
// it. StatTile fills the line with a period-on-period change; other dashboards
// (Today's attention counts) pass their own. One look for every stat card.
export function StatTileFrame({ label, value, footer, onClick, selected = false }: FrameProps) {
  if (!onClick) {
    return (
      <div className="rounded-lg border border-border bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
        <div className="mt-1.5 h-5">{footer}</div>
      </div>
    );
  }
  // Interactive: phrasing content only inside a <button>.
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`block w-full rounded-lg border bg-white p-4 text-left transition-colors hover:bg-canvas ${selected ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
    >
      <span className="block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="mt-2 block text-2xl font-semibold text-text">{value}</span>
      <span className="mt-1.5 block h-5">{footer}</span>
    </button>
  );
}

// Stat tile contract (dataviz skill): label, value (auto-compact), delta
// signed vs a named period, color = direction (all four dashboard metrics
// are "more is better", so up is always good here). "New"/"Building history"
// are rendered distinctly, never as a misleading 0% or a blank.
export function StatTile({ label, comparison, format = defaultFormat }: Props) {
  return (
    <StatTileFrame
      label={label}
      value={format(comparison.current)}
      footer={
        <>
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
        </>
      }
    />
  );
}
