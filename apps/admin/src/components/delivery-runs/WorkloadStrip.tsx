'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DeliveryDaySummary } from '@wholo/types';
import { adminDeliveryRunsApi } from '@wholo/admin-api-client';
import { toIso, addDays } from '@/lib/date';

interface WorkloadStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  // The visible Monday-start week — owned by the parent (page.tsx) so it can
  // stay in sync with the DeliveryDateRangeControl header pill, which shows
  // the same week's range and can jump it directly via its date picker.
  weekStart: Date;
  onWeekStartChange: (next: Date) => void;
  // Bump this (e.g. after a change-delivery-date mutation moves a stop from
  // one day to another) to force a re-fetch of the current week — this
  // component otherwise only reloads on token/week-navigation changes, so a
  // cross-day move would leave its counts stale otherwise.
  refreshKey?: number;
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Doubles as the date picker (decision #10 in the delivery-planning-pbi-plan
// decisions log) — replaces a calendar popover with a always-visible 7-day
// strip showing each day's workload count. The month/year the strip is
// showing is surfaced by the sibling DeliveryDateRangeControl in the page
// header, not repeated here.
export function WorkloadStrip({ selectedDate, onSelectDate, weekStart, onWeekStartChange, refreshKey,
}: WorkloadStripProps) {
  const [days, setDays] = useState<DeliveryDaySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {    setIsLoading(true);
    try {
      const weekEnd = addDays(weekStart, 6);
      const result = await adminDeliveryRunsApi.listDays({ from: toIso(weekStart), to: toIso(weekEnd) });
      setDays(result.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [weekStart]);

  // refreshKey carries no data of its own — it's only in this dependency
  // list to force a re-fetch when a cross-day mutation happens elsewhere.
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-white p-2">
      <button
        type="button"
        onClick={() => onWeekStartChange(addDays(weekStart, -7))}
        className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-text"
        aria-label="Previous week"
      >
        <ChevronIcon direction="left" />
      </button>
      {error ? (
        <p className="flex-1 text-center text-xs text-red-700">Failed to load the workload strip.</p>
      ) : (
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((day) => {
            const isSelected = day.date === selectedDate;
            const label = new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString('en-GB', {
              weekday: 'short', day: 'numeric', timeZone: 'UTC',
            });
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDate(day.date)}
                className={`flex flex-col items-center rounded-md px-2 py-1.5 text-xs transition-colors ${
                  isSelected ? 'bg-primary text-primary-fg' : 'text-text hover:bg-canvas'
                }`}
              >
                <span className="font-medium">{label}</span>
                <span className={isSelected ? 'text-primary-fg/80' : 'text-muted'}>
                  {isLoading ? '–' : day.stopCount}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => onWeekStartChange(addDays(weekStart, 7))}
        className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-text"
        aria-label="Next week"
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );
}
