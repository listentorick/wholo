import type { UnallocatedReason } from '@wholo/types';
import type { StatusTone } from '@/components/list/StatusBadge';

// Reason copy for an unassigned card — informational blue, never a warning
// tone, since most unassigned orders are simply not due yet.
export const UNALLOCATED_REASON_COPY: Record<UnallocatedReason | 'NONE', string> = {
  NO_ROUTE: 'No delivery route',
  RUN_READY: 'Run already marked ready',
  NO_SCHEDULED_DATE: 'No scheduled delivery date',
  NONE: 'Ready to assign',
};

export function unallocatedReasonCopy(reason: UnallocatedReason | null): string {
  return UNALLOCATED_REASON_COPY[reason ?? 'NONE'];
}

export const UNASSIGNED_BADGE: { label: string; tone: StatusTone } = { label: 'Unassigned', tone: 'blue' };
export const READY_BADGE: { label: string; tone: StatusTone } = { label: 'Ready', tone: 'green' };
export const OPEN_BADGE: { label: string; tone: StatusTone } = { label: 'Open', tone: 'gray' };

// Missed styling is intentionally amber, never the brand accent (#F2864D) —
// that color is reserved for the decorative PageHeading underline.
export const MISSED_CLASSES = 'border-l-2 border-l-amber-400';
export const MISSED_CHIP_CLASSES = 'inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800';

// Shared by missedCopy below and ChangeDeliveryDateDialog's drift note — one
// short-date format for the whole feature.
export function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function missedCopy(dueDate: string): string {
  return `Missed — was due ${formatShortDate(dueDate)}`;
}

export function totalsCopy(stopCount: number, itemCount: number): string {
  return `${stopCount} ${stopCount === 1 ? 'stop' : 'stops'} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
}

// Per-card totals read "N lines · M items", never "N stops" (a card is one
// stop already, shown by its own position) and never "cases" (fabricated —
// there is no pack-size field anywhere in the schema).
export function lineItemsCopy(lineCount: number, itemCount: number): string {
  return `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
}
