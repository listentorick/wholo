'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DeliveryDaySummary } from '@wholo/types';
import { adminDeliveryRunsApi } from '@wholo/admin-api-client';
import { toIso } from '@/lib/date';

interface WorkloadStripProps {
  token: string | null | undefined;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  // Bump this (e.g. after a change-delivery-date mutation moves a stop from
  // one day to another) to force a re-fetch of the current week — this
  // component otherwise only reloads on token/week-navigation changes, so a
  // cross-day move would leave its counts stale otherwise.
  refreshKey?: number;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-start week
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Doubles as the date picker (decision #10 in the delivery-planning-pbi-plan
// decisions log) — replaces a calendar popover with a always-visible 7-day
// strip showing each day's workload count.
export function WorkloadStrip({
  token, selectedDate, onSelectDate, refreshKey,
}: WorkloadStripProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(`${selectedDate}T00:00:00`)));
  const [days, setDays] = useState<DeliveryDaySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const weekEnd = addDays(weekStart, 6);
      const result = await adminDeliveryRunsApi.listDays(token, { from: toIso(weekStart), to: toIso(weekEnd) });
      setDays(result.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [token, weekStart]);

  // refreshKey carries no data of its own — it's only in this dependency
  // list to force a re-fetch when a cross-day mutation happens elsewhere.
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-white p-2">
      <button
        type="button"
        onClick={() => setWeekStart((d) => addDays(d, -7))}
        className="rounded p-1.5 text-muted hover:bg-canvas hover:text-text"
        aria-label="Previous week"
      >
        ‹
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
        onClick={() => setWeekStart((d) => addDays(d, 7))}
        className="rounded p-1.5 text-muted hover:bg-canvas hover:text-text"
        aria-label="Next week"
      >
        ›
      </button>
    </div>
  );
}
