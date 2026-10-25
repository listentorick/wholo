import { DistributorAttentionReason } from '@wholo/types';

const DAY_MS = 86_400_000;
export const NEW_DISTRIBUTOR_DAYS = 14;
export const QUIET_DISTRIBUTOR_DAYS = 21;

/** YYYY-MM-DD of a UTC date. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A continuous daily series of `days` entries ending on `today` (inclusive),
 * zero-filled where no orders were counted.
 */
export function fillDailySeries(rows: { date: Date; orders: number }[], today: Date, days: number): { date: string; orders: number }[] {
  const byDay = new Map(rows.map((r) => [isoDay(r.date), r.orders]));
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - (days - 1) * DAY_MS;
  return Array.from({ length: days }, (_, i) => {
    const date = isoDay(new Date(start + i * DAY_MS));
    return { date, orders: byDay.get(date) ?? 0 };
  });
}

/** Why a wholesaler is worth a look from the Ops dashboard. */
export function attentionReasons(
  d: { createdAt: Date; products: number; lastOrderAt: Date | null },
  now: Date,
): DistributorAttentionReason[] {
  const reasons: DistributorAttentionReason[] = [];
  if (now.getTime() - d.createdAt.getTime() <= NEW_DISTRIBUTOR_DAYS * DAY_MS && d.products === 0) {
    reasons.push('NEW_WITHOUT_PRODUCTS');
  }
  if (d.lastOrderAt && now.getTime() - d.lastOrderAt.getTime() > QUIET_DISTRIBUTOR_DAYS * DAY_MS) {
    reasons.push('NO_RECENT_ORDERS');
  }
  return reasons;
}
