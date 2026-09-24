import type { CustomerHealthReason, CustomerHealthSalesConcentration, CustomerHealthSignalCode, CustomerHealthTier } from '@wholo/types';
import { classifyComparison } from '../analytics/comparison';

// Rule-based flags with fixed, non-configurable thresholds — kept here as named
// constants purely for findability, not because a distributor can tune them.
// Pure and I/O-free by design: every evaluate* function takes already-fetched
// per-customer numbers and returns reasons, so the rules are tested as plain
// behaviour (see customer-health.logic.spec.ts) with no Prisma involved.
//
// Defaults below are a starting point, not locked — expect to tune once seen
// against real distributor data.

export const MISSED_ORDER_MIN_GAP_COUNT = 3; // needs >=3 historical gaps, i.e. >=4 distinct order dates
export const MISSED_ORDER_WATCH_MULTIPLIER = 1.5;
export const MISSED_ORDER_AT_RISK_MULTIPLIER = 2.5;

export const SPEND_WATCH_DECLINE_PCT = 15;
export const SPEND_AT_RISK_DECLINE_PCT = 30;

export const DELIVERY_MIN_ATTEMPTS = 3;
export const DELIVERY_WINDOW = 8;
export const DELIVERY_WATCH_COUNT = 2;
export const DELIVERY_AT_RISK_COUNT = 3;

export const NEVER_ORDERED_GRACE_DAYS = 30;

export const MISTAKES_WATCH_COUNT = 1;
export const MISTAKES_AT_RISK_COUNT = 2;

export const RANGE_MIN_ORDERS = 2;
export const RANGE_WATCH_DECLINE_PCT = 25;
export const RANGE_AT_RISK_DECLINE_PCT = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function reason(
  code: CustomerHealthSignalCode,
  category: CustomerHealthReason['category'],
  severity: CustomerHealthReason['severity'],
  text: string,
): CustomerHealthReason[] {
  return [{ code, category, severity, text }];
}

export interface MissedOrderInput {
  /** Median gap, in days, between this customer's own historical order dates. Null with too little history. */
  medianGapDays: number | null;
  /** Number of historical gaps the median was computed from (order dates - 1). */
  gapCount: number;
  /** Days since this customer's last qualifying order, as of today. */
  currentGapDays: number;
}

/** Compares the gap since the last order to the customer's own historical baseline, not a flat day count. */
export function evaluateMissedOrder(input: MissedOrderInput): CustomerHealthReason[] {
  const { medianGapDays, gapCount, currentGapDays } = input;
  if (medianGapDays == null || medianGapDays <= 0 || gapCount < MISSED_ORDER_MIN_GAP_COUNT) return [];

  const ratio = currentGapDays / medianGapDays;
  const usual = Math.round(medianGapDays);
  if (ratio >= MISSED_ORDER_AT_RISK_MULTIPLIER) {
    return reason('MISSED_ORDER', 'customer_behaviour', 'at_risk', `No order in ${currentGapDays} days (usual gap ~${usual} days)`);
  }
  if (ratio >= MISSED_ORDER_WATCH_MULTIPLIER) {
    return reason('MISSED_ORDER', 'customer_behaviour', 'watch', `${currentGapDays} days since last order, above their usual ~${usual}-day gap`);
  }
  return [];
}

export interface SpendTrendInput {
  current: number;
  comparisonValue: number;
  earliestDataDate: Date | null;
  comparisonRangeEnd: Date;
}

/** Reuses the same period-over-period classification the Sales dashboard uses, rather than reimplementing it. */
export function evaluateSpendTrend(input: SpendTrendInput): CustomerHealthReason[] {
  const comparison = classifyComparison(input.current, input.comparisonValue, input.earliestDataDate, input.comparisonRangeEnd);
  if (comparison.status !== 'value' || comparison.percentageChange == null || comparison.percentageChange >= 0) return [];

  const decline = -comparison.percentageChange;
  if (decline >= SPEND_AT_RISK_DECLINE_PCT) {
    return reason('SPEND_DOWN', 'customer_behaviour', 'at_risk', `Spend down ${Math.round(decline)}% vs. the previous 30 days`);
  }
  if (decline >= SPEND_WATCH_DECLINE_PCT) {
    return reason('SPEND_DOWN', 'customer_behaviour', 'watch', `Spend down ${Math.round(decline)}% vs. the previous 30 days`);
  }
  return [];
}

export interface DeliveryReliabilityInput {
  /** Deliveries attempted, capped at DELIVERY_WINDOW (the caller only fetches the last 8). */
  attempted: number;
  lateOrFailed: number;
}

export function evaluateDeliveryReliability(input: DeliveryReliabilityInput): CustomerHealthReason[] {
  const { attempted, lateOrFailed } = input;
  if (attempted < DELIVERY_MIN_ATTEMPTS) return [];

  if (lateOrFailed >= DELIVERY_AT_RISK_COUNT) {
    return reason('LATE_DELIVERY', 'customer_behaviour', 'at_risk', `${lateOrFailed} of last ${attempted} deliveries late or failed`);
  }
  if (lateOrFailed >= DELIVERY_WATCH_COUNT) {
    return reason('LATE_DELIVERY', 'customer_behaviour', 'watch', `${lateOrFailed} of last ${attempted} deliveries late or failed`);
  }
  return [];
}

export interface NeverOrderedInput {
  hasEverOrdered: boolean;
  /** When the customer became a customer — see the roster query for how that is derived. */
  activeSince: Date;
}

/** The only rule that forces At-risk on its own — a relationship that should be ordering and isn't is unambiguous. */
export function evaluateNeverOrdered(input: NeverOrderedInput, today: Date): CustomerHealthReason[] {
  if (input.hasEverOrdered) return [];
  const ageDays = daysBetween(input.activeSince, today);
  if (ageDays < NEVER_ORDERED_GRACE_DAYS) return [];
  return reason('NEVER_ORDERED', 'no_relationship_yet', 'at_risk', `No orders since becoming a customer ${ageDays} days ago`);
}

export interface MistakesInput {
  rejectedOrCancelledCount: number;
}

/**
 * "our_fault" reasons are shown on the customer's row but excluded from
 * rollUpTier's risk roll-up — this is our failure, not evidence the customer
 * is disengaging, so it never moves the health tier by itself.
 */
export function evaluateMistakes(input: MistakesInput): CustomerHealthReason[] {
  const { rejectedOrCancelledCount: count } = input;
  if (count >= MISTAKES_AT_RISK_COUNT) {
    return reason('OUR_MISTAKES', 'our_fault', 'at_risk', `${count} orders rejected or cancelled in the last 90 days`);
  }
  if (count >= MISTAKES_WATCH_COUNT) {
    return reason('OUR_MISTAKES', 'our_fault', 'watch', `${count} order rejected or cancelled in the last 90 days`);
  }
  return [];
}

export interface RangeNarrowingInput {
  currentAvgSku: number | null;
  currentOrders: number;
  baselineAvgSku: number | null;
  baselineOrders: number;
}

export function evaluateRangeNarrowing(input: RangeNarrowingInput): CustomerHealthReason[] {
  const { currentAvgSku, currentOrders, baselineAvgSku, baselineOrders } = input;
  if (currentOrders < RANGE_MIN_ORDERS || baselineOrders < RANGE_MIN_ORDERS || baselineAvgSku == null || baselineAvgSku <= 0 || currentAvgSku == null) {
    return [];
  }

  const decline = ((baselineAvgSku - currentAvgSku) / baselineAvgSku) * 100;
  if (decline < 0) return [];
  if (decline >= RANGE_AT_RISK_DECLINE_PCT) {
    return reason('RANGE_NARROWING', 'customer_behaviour', 'at_risk', `Ordering ${Math.round(decline)}% fewer distinct products per order than usual`);
  }
  if (decline >= RANGE_WATCH_DECLINE_PCT) {
    return reason('RANGE_NARROWING', 'customer_behaviour', 'watch', `Ordering ${Math.round(decline)}% fewer distinct products per order than usual`);
  }
  return [];
}

/**
 * At risk if NEVER_ORDERED fires, or any other rule fires at at-risk severity,
 * or >=2 rules fire at watch severity together. "our_fault" reasons are
 * displayed but excluded from this roll-up entirely (see evaluateMistakes).
 */
export function rollUpTier(reasons: CustomerHealthReason[]): CustomerHealthTier {
  const risk = reasons.filter((r) => r.category !== 'our_fault');
  if (risk.some((r) => r.code === 'NEVER_ORDERED' || r.severity === 'at_risk')) return 'at_risk';

  const watchCount = risk.filter((r) => r.severity === 'watch').length;
  if (watchCount >= 2) return 'at_risk';
  if (watchCount === 1) return 'watch';
  return 'healthy';
}

export const SALES_CONCENTRATION_TOP_N = 5;

export interface SalesConcentrationInput {
  /** Qualifying sales per customer organisation over the period, including customers with no active relationship. */
  salesByOrganisation: Array<{ traderCustomerId: string; value: number }>;
  /** The active-relationship roster; top customers are identified by organisation id, which is what /customers/:id addresses. */
  roster: Array<{ organisationId: string; customerName: string }>;
  tierByOrganisation: Map<string, CustomerHealthTier>;
  periodDays: number;
}

/**
 * Where sales come from: the top customers by value, and everyone else as one
 * remainder. The total counts every customer's sales, so a customer without an
 * active relationship (and anyone outside the top five) lands in "other"
 * rather than vanishing from the denominator.
 */
export function buildSalesConcentration(input: SalesConcentrationInput): CustomerHealthSalesConcentration {
  const rosterByOrganisation = new Map(input.roster.map((c) => [c.organisationId, c]));
  const totalValue = input.salesByOrganisation.reduce((sum, r) => sum + r.value, 0);
  const share = (value: number) => (totalValue > 0 ? value / totalValue : null);

  const topCustomers = input.salesByOrganisation
    .filter((r) => r.value > 0 && rosterByOrganisation.has(r.traderCustomerId))
    .sort((a, b) => b.value - a.value)
    .slice(0, SALES_CONCENTRATION_TOP_N)
    .map((r) => {
      const customer = rosterByOrganisation.get(r.traderCustomerId)!;
      return {
        customerId: customer.organisationId,
        customerName: customer.customerName,
        tier: input.tierByOrganisation.get(r.traderCustomerId) ?? 'healthy',
        value: r.value,
        share: share(r.value),
      };
    });

  const topValue = topCustomers.reduce((sum, c) => sum + c.value, 0);
  const otherValue = totalValue - topValue;
  return {
    periodDays: input.periodDays,
    totalValue,
    top5Share: share(topValue),
    topCustomers,
    otherValue,
    otherShare: share(otherValue),
  };
}
