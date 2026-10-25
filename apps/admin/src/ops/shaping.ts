import type { DistributorAttentionReason, PlatformDistributor, PlatformStats } from '@wholo/types';
import type { ActiveFilter } from '@/components/list/filter-bar/types';

/** Period-on-period change in percent; null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export const ATTENTION_LABELS: Record<DistributorAttentionReason, string> = {
  NEW_WITHOUT_PRODUCTS: 'New, no products yet',
  NO_RECENT_ORDERS: 'No orders for 3 weeks',
};

/** The orders-per-day chart's x labels and bar values. */
export function ordersSeries(stats: Pick<PlatformStats, 'ordersPerDay'>): { dates: string[]; orders: number[] } {
  return { dates: stats.ordersPerDay.map((d) => d.date), orders: stats.ordersPerDay.map((d) => d.orders) };
}

/** Wholesalers to look at on the Ops home: those needing attention, newest first, at most `limit`. */
export function toLookAt(distributors: PlatformDistributor[], limit = 5): PlatformDistributor[] {
  return distributors
    .filter((d) => d.attention.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

const ago = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 days ago", "never". */
export function lastOrderText(lastOrderAt: string | null, now: Date = new Date()): string {
  if (!lastOrderAt) return 'Never';
  const days = Math.round((new Date(lastOrderAt).getTime() - now.getTime()) / 86_400_000);
  return days === 0 ? 'Today' : ago.format(days, 'day');
}

/** The Wholesalers page's views: everyone, those needing attention, or those I have access to now. */
export type WholesalerView = 'all' | 'attention' | 'mine';

/** The wholesalers query for the page's filter chips and view; a blank name is no filter. */
export function distributorQuery(filters: ActiveFilter[], view: WholesalerView): { q?: string; filter?: 'attention' | 'mine' } {
  const query: { q?: string; filter?: 'attention' | 'mine' } = {};
  for (const f of filters) {
    if (f.field === 'search' && typeof f.value === 'string' && f.value.trim()) query.q = f.value.trim();
  }
  if (view !== 'all') query.filter = view;
  return query;
}
