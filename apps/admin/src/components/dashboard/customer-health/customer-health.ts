import type { CustomerHealthBuyingTrendWeek, CustomerHealthReason, CustomerHealthSalesConcentration, CustomerHealthTier } from '@wholo/types';
import type { StatusTone } from '@/components/list/StatusBadge';
import { MONTH_ABBR } from '@/lib/date';

// Pure presentation rules for the Customer health dashboard, kept out of the
// components so they can be tested as behaviour.

export const TIER_META: Record<CustomerHealthTier, { label: string; tone: StatusTone }> = {
  healthy: { label: 'Healthy', tone: 'green' },
  watch: { label: 'Watch', tone: 'orange' },
  at_risk: { label: 'At risk', tone: 'red' },
};

/** "18 Sep" for a YYYY-MM-DD date — a calendar date, so no timezone or locale data involved. */
export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number);
  return `${day} ${MONTH_ABBR[month - 1]}`;
}

/**
 * "Us: …" for a reason we caused (a rejected/cancelled order) — distinguishes
 * an operational failure from customer-driven decline in the text itself,
 * never by colour alone.
 */
export function reasonText(reason: CustomerHealthReason): string {
  return reason.category === 'our_fault' ? `Us: ${reason.text}` : reason.text;
}

/** For the tier bar's accessible label — the chart itself is canvas-drawn. */
export function healthTierSummary(counts: { healthy: number; watch: number; at_risk: number }): string {
  const total = counts.healthy + counts.watch + counts.at_risk;
  return `${counts.healthy} of ${total} customers healthy, ${counts.watch} watch, ${counts.at_risk} at risk`;
}

/** Whether there is a baseline to expect against — without one every week's expectation is null. */
export function hasExpectedOrders(weeks: CustomerHealthBuyingTrendWeek[]): boolean {
  return weeks.some((w) => w.expectedOrders !== null);
}

/** For the buying-trends chart's accessible label. */
export function buyingTrendsSummary(weeks: CustomerHealthBuyingTrendWeek[]): string {
  if (weeks.length === 0) return 'No buying-trend data yet.';
  const expected = hasExpectedOrders(weeks);
  const values = weeks.flatMap((w) => [w.placedOrders, ...(expected && w.expectedOrders !== null ? [w.expectedOrders] : [])]);
  const range = `values ranging from ${Math.min(...values)} to ${Math.max(...values)}`;
  return expected
    ? `Weekly expected vs. placed orders for the last ${weeks.length} weeks, ${range}`
    : `Weekly placed orders for the last ${weeks.length} weeks, ${range}`;
}

/** Escapes text for interpolation into an HTML string — ECharts renders tooltip formatter output as HTML, and customer names are typed by other tenants. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "27.9%" for a 0–1 share; an em dash when there is nothing to share out. */
export function formatShare(share: number | null): string {
  return share === null ? '—' : `${(share * 100).toFixed(1)}%`;
}

/** For the sales chart's accessible label. */
export function salesConcentrationSummary(sales: CustomerHealthSalesConcentration): string {
  if (sales.topCustomers.length === 0) return `No sales in the last ${sales.periodDays} days.`;
  const names = sales.topCustomers.map((c) => `${c.customerName} (${TIER_META[c.tier].label})`).join(', ');
  return `Top ${sales.topCustomers.length} customers by sales in the last ${sales.periodDays} days, ${formatShare(sales.top5Share)} of the total: ${names}`;
}
