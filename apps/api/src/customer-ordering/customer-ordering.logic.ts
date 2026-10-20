import type { OrderingTrendStatus } from '@wholo/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface OrderingPeriods {
  periodStart: string;
  periodEnd: string;
  /** The period of the same length just before it, for the trend. */
  previousStart: string;
  previousEnd: string;
}

// The reporting period is the `days` days ending today, both ends included,
// and the previous period is the same length immediately before it. Dates are
// distributor-local YYYY-MM-DD, like distributorLocalDate on the facts.
export function orderingPeriods(today: string, days: number): OrderingPeriods {
  const end = toMs(today);
  const start = end - (days - 1) * DAY_MS;
  return {
    periodStart: fromMs(start),
    periodEnd: today,
    previousStart: fromMs(start - days * DAY_MS),
    previousEnd: fromMs(start - DAY_MS),
  };
}

// Whole days from `from` to `to` (both YYYY-MM-DD).
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

// The change in spend that counts as up or down rather than noise, as a share of the previous period.
export const ORDERING_TREND_MIN_CHANGE = 0.2;

// Spend in the period against the previous one. A trend needs the customer to
// have been ordering for the whole previous period — a customer who started
// part-way through it would always look as if they were growing.
export function orderingTrend(input: {
  firstOrderDate: string | null;
  previousStart: string;
  currentSpend: number;
  previousSpend: number;
}): OrderingTrendStatus {
  const { firstOrderDate, previousStart, currentSpend, previousSpend } = input;
  if (firstOrderDate == null || firstOrderDate > previousStart) return 'insufficient_history';
  if (previousSpend === 0) return currentSpend > 0 ? 'up' : 'steady';
  const change = (currentSpend - previousSpend) / previousSpend;
  if (change >= ORDERING_TREND_MIN_CHANGE) return 'up';
  if (change <= -ORDERING_TREND_MIN_CHANGE) return 'down';
  return 'steady';
}
