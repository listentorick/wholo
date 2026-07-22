import { distributorLocalDate } from '../common/distributor-local-date';

export const PERIOD_KEYS = ['today', 'week', 'month', 'rolling7', 'rolling30', 'rolling90', 'rolling365', 'custom'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

/** Inclusive range of distributor-local calendar days (UTC-midnight Dates, matching `distributorLocalDate`'s convention). */
export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface ResolvedPeriod {
  current: PeriodRange;
  /** Null when there's no valid equivalent prior period to compare against (e.g. a custom range starting at epoch). */
  comparison: PeriodRange | null;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfWeek(date: Date): Date {
  // Monday-start week, matching ISO convention. getUTCDay(): 0=Sun..6=Sat.
  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Same day-of-month one calendar month earlier, clamped to that month's last day (e.g. Mar 31 -> Feb 28/29). */
function sameDayPreviousMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const prevMonthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, prevMonthLastDay)));
}

/**
 * Resolves a period key (or explicit custom range) into distributor-local
 * day boundaries plus the immediately preceding equivalent comparison period
 * (PRD §4.1). `now` is injectable for tests; defaults to the real current time.
 *
 * Known simplification: "today" compares full calendar day vs. full calendar
 * day (today vs. yesterday), not elapsed-time-of-day fairness (the PRD's
 * "same elapsed time on the previous comparable day") — that needs
 * sub-day-granularity data (order_facts.occurredAt) rather than the
 * day-granularity order_analytics_state this reads from. Deferred; every
 * other period already compares like-for-like spans.
 */
export function resolvePeriod(
  timezone: string,
  period: PeriodKey,
  custom?: { start: string; end: string },
  now: Date = new Date(),
): ResolvedPeriod {
  const today = distributorLocalDate(now, timezone);

  switch (period) {
    case 'today':
      return { current: { start: today, end: today }, comparison: { start: addDays(today, -1), end: addDays(today, -1) } };

    case 'week': {
      const start = startOfWeek(today);
      const spanDays = Math.round((today.getTime() - start.getTime()) / 86_400_000);
      const prevStart = addDays(start, -7);
      return { current: { start, end: today }, comparison: { start: prevStart, end: addDays(prevStart, spanDays) } };
    }

    case 'month': {
      const start = startOfMonth(today);
      const prevStart = sameDayPreviousMonth(start);
      const prevEnd = sameDayPreviousMonth(today);
      return { current: { start, end: today }, comparison: { start: prevStart, end: prevEnd } };
    }

    case 'rolling7':
    case 'rolling30':
    case 'rolling90':
    case 'rolling365': {
      const n = { rolling7: 7, rolling30: 30, rolling90: 90, rolling365: 365 }[period];
      const start = addDays(today, -(n - 1));
      const prevEnd = addDays(start, -1);
      const prevStart = addDays(prevEnd, -(n - 1));
      return { current: { start, end: today }, comparison: { start: prevStart, end: prevEnd } };
    }

    case 'custom': {
      if (!custom) throw new Error('resolvePeriod("custom") requires a { start, end } range');
      const start = new Date(`${custom.start}T00:00:00.000Z`);
      const end = new Date(`${custom.end}T00:00:00.000Z`);
      const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      const prevEnd = addDays(start, -1);
      const prevStart = addDays(prevEnd, -(spanDays - 1));
      return { current: { start, end }, comparison: { start: prevStart, end: prevEnd } };
    }
  }
}
