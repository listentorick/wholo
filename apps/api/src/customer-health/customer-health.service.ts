import { Injectable } from '@nestjs/common';
import type { CustomerHealthBuyingTrendWeek, CustomerHealthReason, CustomerHealthResponse, CustomerHealthTier, FlaggedCustomer } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { QUALIFYING_STATUSES } from '../analytics/analytics.service';
import { resolvePeriod } from '../analytics/period';
import {
  DELIVERY_HISTORY_DAYS,
  DELIVERY_WINDOW,
  MISSED_ORDER_HISTORY_DATES,
  buildSalesConcentration,
  daysBetween,
  evaluateDeliveryReliability,
  evaluateMissedOrder,
  evaluateMistakes,
  evaluateNeverOrdered,
  evaluateRangeNarrowing,
  evaluateSpendTrend,
  rollUpTier,
} from './customer-health.logic';

const WEEKS_IN_WINDOW = 8;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Monday-start week, matching period.ts's convention (and Postgres's date_trunc('week', ...), which is also ISO/Monday-start). */
function startOfWeek(date: Date): Date {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

interface RosterRow {
  organisationId: string;
  customerName: string;
  activeSince: Date;
}
interface MissedOrderRow {
  traderCustomerId: string;
  gapCount: number;
  medianGapDays: number | null;
  lastOrderDate: Date;
}
interface SpendRow {
  traderCustomerId: string;
  value: number;
}
interface DeliveryRow {
  traderCustomerId: string;
  attempted: number;
  lateOrFailed: number;
}
interface MistakesRow {
  traderCustomerId: string;
  rejectedOrCancelledCount: number;
}
interface RangeRow {
  traderCustomerId: string;
  currentAvgSku: number | null;
  currentOrders: number;
  baselineAvgSku: number | null;
  baselineOrders: number;
}

// Rule-based customer-health signals, computed distributor-wide in one pass
// (see customer-health.logic.ts for the rules themselves). Every query here
// scans order_analytics_state/order_facts/order_line_facts/delivery_facts
// scoped to a single distributorId, then joined onto the active-relationship
// roster in application code (the same style analytics.service.ts's
// customerRankings uses for its comparison map) rather than with more SQL
// joins, since each signal has a different shape and window.
@Injectable()
export class CustomerHealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** `now` is injectable for tests (matching period.ts's resolvePeriod), defaulting to the real current time. */
  async getHealth(distributorId: string, now: Date = new Date()): Promise<CustomerHealthResponse> {
    const settings = await this.prisma.distributorSettings.findUnique({ where: { distributorId }, select: { timezone: true } });
    const timezone = settings?.timezone ?? 'UTC';
    const today = distributorLocalDate(now, timezone);

    const spendPeriod = resolvePeriod(timezone, 'rolling30', undefined, now);
    const spendComparison = spendPeriod.comparison ?? spendPeriod.current;
    const rolling90 = resolvePeriod(timezone, 'rolling90', undefined, now);
    const rangePeriod = resolvePeriod(timezone, 'rolling30', undefined, now);
    const rangeBaseline = rangePeriod.comparison ?? rangePeriod.current;

    // The trend covers the last 8 *complete* Mon–Sun weeks: a part-finished week set against a full-week
    // expectation would read as a sudden drop. The baseline is the 8 weeks before that.
    const currentWeekStart = startOfWeek(today);
    const trendWindowStart = addDays(currentWeekStart, -7 * WEEKS_IN_WINDOW);
    const trendWindowEnd = addDays(currentWeekStart, -1);
    const baselineEnd = addDays(trendWindowStart, -1);
    const baselineStart = addDays(baselineEnd, -7 * WEEKS_IN_WINDOW + 1);

    const [
      roster,
      neverOrderedSet,
      missedOrderRows,
      spendCurrentRows,
      spendComparisonRows,
      deliveryRows,
      mistakesRows,
      rangeRows,
      earliestDataDate,
      activeCustomers90d,
      placedWeekRows,
      baselineOrderCount,
      salesRows,
    ] = await Promise.all([
      this.rosterRows(distributorId),
      this.neverOrderedSet(distributorId),
      this.missedOrderRows(distributorId),
      this.spendRows(distributorId, spendPeriod.current.start, spendPeriod.current.end),
      this.spendRows(distributorId, spendComparison.start, spendComparison.end),
      this.deliveryRows(distributorId, addDays(today, -DELIVERY_HISTORY_DAYS)),
      this.mistakesRows(distributorId, rolling90.current.start),
      this.rangeRows(distributorId, rangePeriod.current.start, rangePeriod.current.end, rangeBaseline.start, rangeBaseline.end),
      this.earliestDataDate(distributorId),
      this.activeCustomersCount(distributorId, rolling90.current.start, rolling90.current.end),
      this.placedWeekRows(distributorId, trendWindowStart, trendWindowEnd),
      this.baselineOrderCount(distributorId, baselineStart, baselineEnd),
      this.spendRows(distributorId, rolling90.current.start, rolling90.current.end),
    ]);

    const missedByCustomer = new Map(missedOrderRows.map((r) => [r.traderCustomerId, r]));
    const spendCurrentByCustomer = new Map(spendCurrentRows.map((r) => [r.traderCustomerId, r.value]));
    const spendComparisonByCustomer = new Map(spendComparisonRows.map((r) => [r.traderCustomerId, r.value]));
    const deliveryByCustomer = new Map(deliveryRows.map((r) => [r.traderCustomerId, r]));
    const mistakesByCustomer = new Map(mistakesRows.map((r) => [r.traderCustomerId, r.rejectedOrCancelledCount]));
    const rangeByCustomer = new Map(rangeRows.map((r) => [r.traderCustomerId, r]));
    const comparisonRangeEnd = spendComparison.end;

    const tierCounts = { healthy: 0, watch: 0, at_risk: 0 };
    const tierByOrganisation = new Map<string, CustomerHealthTier>();
    const needingAttention: FlaggedCustomer[] = [];

    for (const customer of roster) {
      const spend = spendCurrentByCustomer.get(customer.organisationId) ?? 0;
      const comparisonSpend = spendComparisonByCustomer.get(customer.organisationId) ?? 0;
      const missed = missedByCustomer.get(customer.organisationId);
      const delivery = deliveryByCustomer.get(customer.organisationId);
      const mistakesCount = mistakesByCustomer.get(customer.organisationId) ?? 0;
      const range = rangeByCustomer.get(customer.organisationId);
      const hasEverOrdered = !neverOrderedSet.has(customer.organisationId);

      const reasons: CustomerHealthReason[] = [
        ...evaluateNeverOrdered({ hasEverOrdered, activeSince: customer.activeSince }, today),
        ...(missed
          ? evaluateMissedOrder({ medianGapDays: missed.medianGapDays, gapCount: missed.gapCount, currentGapDays: daysBetween(missed.lastOrderDate, today) })
          : []),
        ...evaluateSpendTrend({ current: spend, comparisonValue: comparisonSpend, earliestDataDate, comparisonRangeEnd }),
        ...(delivery ? evaluateDeliveryReliability({ attempted: delivery.attempted, lateOrFailed: delivery.lateOrFailed }) : []),
        ...evaluateMistakes({ rejectedOrCancelledCount: mistakesCount }),
        ...(range
          ? evaluateRangeNarrowing({ currentAvgSku: range.currentAvgSku, currentOrders: range.currentOrders, baselineAvgSku: range.baselineAvgSku, baselineOrders: range.baselineOrders })
          : []),
      ];

      const tier = rollUpTier(reasons);
      tierCounts[tier]++;
      tierByOrganisation.set(customer.organisationId, tier);

      if (tier !== 'healthy') {
        needingAttention.push({
          customerId: customer.organisationId,
          customerName: customer.customerName,
          tier,
          reasons,
          spend30d: spend,
          lastOrderDate: missed ? isoDate(missed.lastOrderDate) : null,
        });
      }
    }

    // At-risk first, then watch; stable within each tier (roster order).
    needingAttention.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'at_risk' ? -1 : b.tier === 'at_risk' ? 1 : 0));

    // Without a fully covered baseline there is nothing sound to expect: null, not a misleading 0 (or an
    // underestimate from a baseline that only partly existed).
    const hasBaseline = earliestDataDate !== null && earliestDataDate.getTime() <= baselineStart.getTime();
    // Everyone's qualifying sales, not only the active roster's: the same basis as the concentration total
    // and the Sales tab, so the numbers on this page and across the dashboards agree.
    const salesLast30d = spendCurrentRows.reduce((sum, r) => sum + r.value, 0);

    const expectedOrders = hasBaseline ? Math.round(baselineOrderCount / WEEKS_IN_WINDOW) : null;
    const placedByWeek = new Map(placedWeekRows.map((r) => [isoDate(r.weekStart), r.placedOrders]));
    const buyingTrends: CustomerHealthBuyingTrendWeek[] = [];
    for (let i = 0; i < WEEKS_IN_WINDOW; i++) {
      const weekStart = isoDate(addDays(trendWindowStart, i * 7));
      buyingTrends.push({ weekStart, expectedOrders, placedOrders: placedByWeek.get(weekStart) ?? 0 });
    }

    return {
      distributorId,
      timezone,
      generatedAt: new Date().toISOString(),
      tiles: { activeCustomers90d, atRiskCount: tierCounts.at_risk, salesLast30d },
      tierCounts,
      needingAttention,
      buyingTrends,
      salesConcentration: buildSalesConcentration({ salesByOrganisation: salesRows, roster, tierByOrganisation, periodDays: 90 }),
    };
  }

  // "Became a customer" is the accepted invitation's date, else the row's creation. The row is created when the
  // invite or request is made, so creation alone would age a customer who accepted long after being invited.
  // Known gap: access a customer requested and the distributor accepted later, and an unsuspended customer,
  // still age from creation — a real activatedAt column would settle that if it matters.
  private async rosterRows(distributorId: string): Promise<RosterRow[]> {
    return this.prisma.$queryRaw<RosterRow[]>`
      SELECT tr."customerId" AS "organisationId", o.name AS "customerName",
        COALESCE(
          (SELECT MAX(ci."acceptedAt") FROM customer_invitations ci WHERE ci."tradeRelationshipId" = tr.id AND ci.status = 'ACCEPTED'),
          tr."createdAt"
        ) AS "activeSince"
      FROM trade_relationships tr
      JOIN organisations o ON o.id = tr."customerId"
      WHERE tr."distributorId" = ${distributorId} AND tr.status = 'ACTIVE' AND tr."deletedAt" IS NULL
    `;
  }

  /** Zero qualifying orders ever (not just outside a window) — the same NOT EXISTS check as analytics.service.ts's actionItems. */
  private async neverOrderedSet(distributorId: string): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<Array<{ organisationId: string }>>`
      SELECT tr."customerId" AS "organisationId"
      FROM trade_relationships tr
      WHERE tr."distributorId" = ${distributorId} AND tr.status = 'ACTIVE' AND tr."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM order_analytics_state s
          WHERE s."distributorId" = tr."distributorId" AND s."traderCustomerId" = tr."customerId"
        )
    `;
    return new Set(rows.map((r) => r.organisationId));
  }

  /**
   * Per-customer median gap between their most recent order dates, and the latest one. Each roster customer's last
   * MISSED_ORDER_HISTORY_DATES distinct dates are read straight off the (distributorId, traderCustomerId,
   * distributorLocalDate DESC) index, so the cost follows the number of customers, not the length of their history —
   * and a customer who lapsed long ago keeps their last dates, so they are still recognised as overdue.
   */
  private async missedOrderRows(distributorId: string): Promise<MissedOrderRow[]> {
    return this.prisma.$queryRaw<MissedOrderRow[]>`
      WITH roster AS (
        SELECT tr."customerId" AS id
        FROM trade_relationships tr
        WHERE tr."distributorId" = ${distributorId} AND tr.status = 'ACTIVE' AND tr."deletedAt" IS NULL
      ), recent AS (
        SELECT r.id AS "traderCustomerId", x."distributorLocalDate"
        FROM roster r
        CROSS JOIN LATERAL (
          SELECT DISTINCT "distributorLocalDate"
          FROM order_analytics_state
          WHERE "distributorId" = ${distributorId} AND "traderCustomerId" = r.id AND status IN ${QUALIFYING_STATUSES}
          ORDER BY "distributorLocalDate" DESC
          LIMIT ${MISSED_ORDER_HISTORY_DATES}
        ) x
      ), gaps AS (
        SELECT "traderCustomerId", "distributorLocalDate",
          "distributorLocalDate" - LAG("distributorLocalDate") OVER (PARTITION BY "traderCustomerId" ORDER BY "distributorLocalDate") AS "gapDays"
        FROM recent
      )
      SELECT "traderCustomerId" AS "traderCustomerId", COUNT("gapDays")::int AS "gapCount",
        (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "gapDays"))::float AS "medianGapDays",
        MAX("distributorLocalDate") AS "lastOrderDate"
      FROM gaps
      GROUP BY "traderCustomerId"
    `;
  }

  private async spendRows(distributorId: string, start: Date, end: Date): Promise<SpendRow[]> {
    return this.prisma.$queryRaw<SpendRow[]>`
      SELECT "traderCustomerId" AS "traderCustomerId", COALESCE(SUM("subtotalAmount"), 0)::float AS value
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
        AND "distributorLocalDate" BETWEEN ${start} AND ${end}
        AND status IN ${QUALIFYING_STATUSES}
      GROUP BY "traderCustomerId"
    `;
  }

  /**
   * Limited to each customer's last DELIVERY_WINDOW deliveries by occurrence, not a date window — buying frequency varies
   * too much for a flat cutoff. One delivery is one order at its latest outcome, so a failed attempt that was retried and
   * delivered late is one delivery, not two.
   */
  private async deliveryRows(distributorId: string, since: Date): Promise<DeliveryRow[]> {
    return this.prisma.$queryRaw<DeliveryRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON ("orderId") "traderCustomerId", outcome, "committedDate", "distributorLocalDate", "occurredAt"
        FROM delivery_facts
        WHERE "distributorId" = ${distributorId} AND "occurredAt" >= ${since}
        ORDER BY "orderId", "occurredAt" DESC
      ), ranked AS (
        SELECT "traderCustomerId", outcome, "committedDate", "distributorLocalDate",
          ROW_NUMBER() OVER (PARTITION BY "traderCustomerId" ORDER BY "occurredAt" DESC) AS rn
        FROM latest
      )
      SELECT "traderCustomerId" AS "traderCustomerId", COUNT(*)::int AS attempted,
        COUNT(*) FILTER (WHERE outcome = 'UNABLE_TO_DELIVER' OR "distributorLocalDate" > "committedDate")::int AS "lateOrFailed"
      FROM ranked
      WHERE rn <= ${DELIVERY_WINDOW}
      GROUP BY "traderCustomerId"
    `;
  }

  /** Event-level, not order_analytics_state's current status — needs each rejection/cancellation that happened in the window, not just an order's final state. */
  private async mistakesRows(distributorId: string, since: Date): Promise<MistakesRow[]> {
    return this.prisma.$queryRaw<MistakesRow[]>`
      SELECT "traderCustomerId" AS "traderCustomerId", COUNT(*)::int AS "rejectedOrCancelledCount"
      FROM order_facts
      WHERE "distributorId" = ${distributorId}
        AND "eventType" IN ('OrderRejected', 'OrderCancelled')
        AND "occurredAt" >= ${since}
      GROUP BY "traderCustomerId"
    `;
  }

  // The facts are chunked by occurredAt but the windows are distributor-local dates, so on their own they cannot skip
  // chunks (every chunk was scanned). A local date is at most a day from the UTC date of the same instant; the two-day
  // margin keeps every row the date window wants while letting old chunks be skipped.
  private async rangeRows(distributorId: string, currentStart: Date, currentEnd: Date, baselineStart: Date, baselineEnd: Date): Promise<RangeRow[]> {
    const occurredSince = addDays(baselineStart, -2);
    return this.prisma.$queryRaw<RangeRow[]>`
      WITH order_sku_counts AS (
        SELECT olf."traderCustomerId", olf."orderId", olf."distributorLocalDate", COUNT(DISTINCT olf."productId") AS "skuCount"
        FROM order_line_facts olf
        JOIN order_analytics_state s ON s."orderId" = olf."orderId" AND s."distributorId" = olf."distributorId"
        WHERE olf."distributorId" = ${distributorId}
          AND s.status IN ${QUALIFYING_STATUSES}
          AND olf."occurredAt" >= ${occurredSince}
          AND olf."distributorLocalDate" BETWEEN ${baselineStart} AND ${currentEnd}
        GROUP BY olf."traderCustomerId", olf."orderId", olf."distributorLocalDate"
      )
      SELECT "traderCustomerId" AS "traderCustomerId",
        (AVG("skuCount") FILTER (WHERE "distributorLocalDate" BETWEEN ${currentStart} AND ${currentEnd}))::float AS "currentAvgSku",
        COUNT(*) FILTER (WHERE "distributorLocalDate" BETWEEN ${currentStart} AND ${currentEnd})::int AS "currentOrders",
        (AVG("skuCount") FILTER (WHERE "distributorLocalDate" BETWEEN ${baselineStart} AND ${baselineEnd}))::float AS "baselineAvgSku",
        COUNT(*) FILTER (WHERE "distributorLocalDate" BETWEEN ${baselineStart} AND ${baselineEnd})::int AS "baselineOrders"
      FROM order_sku_counts
      GROUP BY "traderCustomerId"
    `;
  }

  private async earliestDataDate(distributorId: string): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<Array<{ earliest: Date | null }>>`
      SELECT MIN("distributorLocalDate") AS earliest
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
    `;
    return rows[0]?.earliest ?? null;
  }

  private async activeCustomersCount(distributorId: string, start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT "traderCustomerId")::int AS count
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
        AND "distributorLocalDate" BETWEEN ${start} AND ${end}
        AND status IN ${QUALIFYING_STATUSES}
    `;
    return rows[0]?.count ?? 0;
  }

  private async placedWeekRows(distributorId: string, start: Date, end: Date): Promise<Array<{ weekStart: Date; placedOrders: number }>> {
    return this.prisma.$queryRaw<Array<{ weekStart: Date; placedOrders: number }>>`
      SELECT date_trunc('week', "distributorLocalDate")::date AS "weekStart", COUNT(*)::int AS "placedOrders"
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
        AND "distributorLocalDate" BETWEEN ${start} AND ${end}
        AND status IN ${QUALIFYING_STATUSES}
      GROUP BY 1
    `;
  }

  /** Total qualifying orders in the 8 weeks immediately before the trend window, ÷8 — mathematically the sum of every customer's own trailing weekly average, just computed in one pass instead of per customer. */
  private async baselineOrderCount(distributorId: string, start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
        AND "distributorLocalDate" BETWEEN ${start} AND ${end}
        AND status IN ${QUALIFYING_STATUSES}
    `;
    return rows[0]?.count ?? 0;
  }
}
