'use client';

import { formatDateRange } from '@/lib/date';

interface DeliveryDateRangeControlProps {
  weekStart: Date;
  weekEnd: Date;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

// Sits in the page header's actions row, alongside the attention filters and
// Board/List toggle — the range label is the answer to "what month/week am
// I looking at", which the day strip below deliberately no longer repeats.
// The calendar icon opens the browser's native date picker via an
// overlaid, transparent <input type="date"> spanning the whole pill: no
// showPicker() feature-detection needed, and it works everywhere a native
// date input does.
export function DeliveryDateRangeControl({
  weekStart, weekEnd, selectedDate, onSelectDate,
}: DeliveryDateRangeControlProps) {
  return (
    <div className="relative flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-sm">
      <span className="font-medium text-text">{formatDateRange(weekStart, weekEnd)}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-muted">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
      </svg>
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => {
          if (e.target.value) onSelectDate(e.target.value);
        }}
        aria-label="Jump to a specific date"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
