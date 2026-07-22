'use client';

import type { AnalyticsPeriodKey } from '@wholo/types';

const PRESETS: { key: AnalyticsPeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week to date' },
  { key: 'month', label: 'Month to date' },
  { key: 'rolling7', label: 'Last 7 days' },
  { key: 'rolling30', label: 'Last 30 days' },
  { key: 'rolling90', label: 'Last 90 days' },
];

interface Props {
  period: AnalyticsPeriodKey;
  onChange: (period: AnalyticsPeriodKey) => void;
}

// One row above everything else, presets before custom (dataviz skill,
// interaction.md) — every stat/chart/table below re-renders against the
// same slice so the numbers always agree.
export function PeriodSelector({ period, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Reporting period" className="flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1">
      {PRESETS.map((preset) => {
        const selected = period === preset.key;
        return (
          <button
            key={preset.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(preset.key)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              selected ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-canvas hover:text-text',
            ].join(' ')}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
