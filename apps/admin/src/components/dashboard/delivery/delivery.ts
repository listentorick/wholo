import type {
  DeliveryOutcomeDay,
  DeliveryOverview,
  DeliveryOverviewQueueItem,
  DeliveryOverviewQueueKind,
  DeliveryOverviewRun,
} from '@wholo/types';
import type { StatusTone } from '@/components/list/StatusBadge';
import { MONTH_ABBR } from '@/lib/date';

// Pure presentation rules for the Delivery dashboard, kept out of the components so
// they can be tested as behaviour.

export const QUEUE_KINDS: DeliveryOverviewQueueKind[] = ['FAILED', 'OVERDUE', 'TO_ACCEPT', 'NOT_ON_RUN'];

export const KIND_META: Record<DeliveryOverviewQueueKind, { label: string; tone: StatusTone }> = {
  FAILED: { label: 'Failed', tone: 'red' },
  OVERDUE: { label: 'Overdue', tone: 'red' },
  TO_ACCEPT: { label: 'To accept', tone: 'blue' },
  NOT_ON_RUN: { label: 'Not on a run', tone: 'orange' },
};

const REASON_LABELS: Record<string, string> = {
  CUSTOMER_CLOSED: 'Customer closed',
  CUSTOMER_REFUSED: 'Refused',
  UNABLE_TO_ACCESS_PREMISES: 'No access',
  INCORRECT_ADDRESS: 'Wrong address',
  OTHER: 'Other reason',
};

/** "2h 10m", "45m", "3d 4h" — how long something has been waiting. */
export function formatWait(fromIso: string, nowIso: string): string {
  const minutes = Math.max(0, Math.floor((new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 1) return 'under a minute';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

/** "09:52" in the distributor's timezone (deliveries are recorded against their day, not the viewer's). */
export function timeOfDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso));
}

/** "18 Sep" for a YYYY-MM-DD date — a calendar date, so no timezone or locale data involved. */
export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  return `${day} ${MONTH_ABBR[month - 1]}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 15" for a YYYY-MM-DD date. */
export function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** Calendar arithmetic on a YYYY-MM-DD date, in UTC so DST and the viewer's zone cannot move it. */
export function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The window the trend chart asks for: the seven completed days before the distributor's today. */
export function chartWindow(today: string): { from: string; to: string } {
  return { from: shiftIsoDate(today, -7), to: shiftIsoDate(today, -1) };
}

/** What the row says under the customer's name: why it is here and for how long. */
export function describeItem(item: DeliveryOverviewQueueItem, overview: Pick<DeliveryOverview, 'generatedAt' | 'timezone'>): string {
  switch (item.kind) {
    case 'FAILED': {
      const reason = item.reason ? (REASON_LABELS[item.reason] ?? 'Other reason') : 'No reason recorded';
      return item.since ? `${reason} · ${timeOfDay(item.since, overview.timezone)}` : reason;
    }
    case 'TO_ACCEPT':
      return item.since ? `Waiting ${formatWait(item.since, overview.generatedAt)}` : 'Waiting';
    case 'OVERDUE':
      return `Was due ${item.dueDate ? shortDate(item.dueDate) : 'earlier'}${item.runName ? ` · on ${item.runName}` : ' · not on a run'}`;
    case 'NOT_ON_RUN':
      return 'Due today · not on a run';
  }
}

export function runStatus(run: DeliveryOverviewRun): { label: string; tone: StatusTone } {
  if (run.stopCount > 0 && run.attemptedCount >= run.stopCount) return { label: 'Complete', tone: 'green' };
  if (run.attemptedCount > 0) return { label: 'Delivering', tone: 'green' };
  if (run.status === 'READY') return { label: 'Ready', tone: 'blue' };
  return { label: 'Open', tone: 'gray' };
}

export interface OutcomeBar {
  date: string;
  onTime: number;
  late: number;
  failed: number;
  /** Today only: planned and not yet attempted. */
  todo: number;
  total: number;
  isToday: boolean;
}

/**
 * Previous days come from delivery facts; today is built from the live snapshot
 * and appended, so the two never overlap. Delivered-so-far counts as on time
 * until the day closes and lateness is known.
 */
export function outcomeBars(days: DeliveryOutcomeDay[], today: Pick<DeliveryOverview, 'date' | 'progress'>): OutcomeBar[] {
  const bars: OutcomeBar[] = days
    .filter((day) => day.date < today.date)
    .map((day) => ({ ...day, todo: 0, total: day.onTime + day.late + day.failed, isToday: false }));
  const { delivered, failed, remaining } = today.progress;
  bars.push({ date: today.date, onTime: delivered, late: 0, failed, todo: remaining, total: delivered + failed + remaining, isToday: true });
  return bars;
}

/** Share of completed-day deliveries that were on time, or null when there are none to judge. */
export function onTimeRate(days: DeliveryOutcomeDay[]): number | null {
  const onTime = days.reduce((n, d) => n + d.onTime, 0);
  const all = days.reduce((n, d) => n + d.onTime + d.late + d.failed, 0);
  return all === 0 ? null : Math.round((onTime / all) * 100);
}
