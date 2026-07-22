import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { classifyComparison } from './comparison';
import { PeriodKey, PeriodRange, resolvePeriod } from './period';
import { PeriodQueryDto } from './dto/period-query.dto';

// Qualifying order per the PRD's working definition (§4.1, D-01): submitted,
// accepted or completed. Rejected/cancelled orders never count.
const QUALIFYING_STATUSES = Prisma.sql`('SUBMITTED', 'ACCEPTED', 'COMPLETED')`;

export interface PeriodResponse {
  key: PeriodKey;
  start: string;
  end: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolve(distributorId: string, query: PeriodQueryDto): Promise<{ timezone: string; period: ReturnType<typeof resolvePeriod> }> {
    const period = query.period ?? 'month';
    if (period === 'custom' && (!query.start || !query.end)) {
      throw new BadRequestException('start and end are required when period=custom');
    }

    const settings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { timezone: true },
    });
    const timezone = settings?.timezone ?? 'UTC';

    return {
      timezone,
      period: resolvePeriod(timezone, period, period === 'custom' ? { start: query.start!, end: query.end! } : undefined),
    };
  }

  private async earliestDataDate(distributorId: string): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<Array<{ earliest: Date | null }>>`
      SELECT MIN("distributorLocalDate") AS earliest
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
    `;
    return rows[0]?.earliest ?? null;
  }

  private periodMeta(key: PeriodKey, range: PeriodRange): PeriodResponse {
    return { key, start: range.start.toISOString().slice(0, 10), end: range.end.toISOString().slice(0, 10) };
  }

  private async summaryRow(distributorId: string, range: PeriodRange) {
    const rows = await this.prisma.$queryRaw<Array<{ orderValue: number; orderCount: number; purchasingCustomers: number }>>`
      SELECT
        COALESCE(SUM("subtotalAmount"), 0)::float AS "orderValue",
        COUNT(*)::int AS "orderCount",
        COUNT(DISTINCT "traderCustomerId")::int AS "purchasingCustomers"
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
        AND "distributorLocalDate" BETWEEN ${range.start} AND ${range.end}
        AND status IN ${QUALIFYING_STATUSES}
    `;
    return rows[0] ?? { orderValue: 0, orderCount: 0, purchasingCustomers: 0 };
  }

  async orderSummary(distributorId: string, query: PeriodQueryDto) {
    const { timezone, period } = await this.resolve(distributorId, query);
    const [current, comparison, earliest] = await Promise.all([
      this.summaryRow(distributorId, period.current),
      period.comparison ? this.summaryRow(distributorId, period.comparison) : Promise.resolve({ orderValue: 0, orderCount: 0, purchasingCustomers: 0 }),
      this.earliestDataDate(distributorId),
    ]);
    const comparisonEnd = period.comparison?.end ?? period.current.start;

    const orderValue = classifyComparison(current.orderValue, comparison.orderValue, earliest, comparisonEnd);
    const orderCount = classifyComparison(current.orderCount, comparison.orderCount, earliest, comparisonEnd);
    const purchasingCustomers = classifyComparison(current.purchasingCustomers, comparison.purchasingCustomers, earliest, comparisonEnd);
    const averageOrderValue = classifyComparison(
      current.orderCount > 0 ? current.orderValue / current.orderCount : 0,
      comparison.orderCount > 0 ? comparison.orderValue / comparison.orderCount : 0,
      earliest,
      comparisonEnd,
    );

    return {
      distributorId,
      timezone,
      period: this.periodMeta(query.period ?? 'month', period.current),
      comparisonPeriod: period.comparison ? this.periodMeta(query.period ?? 'month', period.comparison) : null,
      generatedAt: new Date().toISOString(),
      metrics: { orderValue, orderCount, purchasingCustomers, averageOrderValue },
    };
  }

  async orderTrend(distributorId: string, query: PeriodQueryDto) {
    const { timezone, period } = await this.resolve(distributorId, query);

    const [currentSeries, comparisonSeries] = await Promise.all([
      this.trendRows(distributorId, period.current),
      period.comparison ? this.trendRows(distributorId, period.comparison) : Promise.resolve([]),
    ]);

    return {
      distributorId,
      timezone,
      period: this.periodMeta(query.period ?? 'month', period.current),
      comparisonPeriod: period.comparison ? this.periodMeta(query.period ?? 'month', period.comparison) : null,
      generatedAt: new Date().toISOString(),
      current: this.zeroFill(period.current, currentSeries),
      comparison: period.comparison ? this.zeroFill(period.comparison, comparisonSeries) : [],
    };
  }

  private async trendRows(distributorId: string, range: PeriodRange) {
    return this.prisma.$queryRaw<Array<{ date: Date; value: number; count: number }>>`
      SELECT "distributorLocalDate" AS date, COALESCE(SUM("subtotalAmount"), 0)::float AS value, COUNT(*)::int AS count
      FROM order_analytics_state
      WHERE "distributorId" = ${distributorId}
        AND "distributorLocalDate" BETWEEN ${range.start} AND ${range.end}
        AND status IN ${QUALIFYING_STATUSES}
      GROUP BY "distributorLocalDate"
      ORDER BY "distributorLocalDate"
    `;
  }

  private zeroFill(range: PeriodRange, rows: Array<{ date: Date; value: number; count: number }>) {
    const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
    const days: Array<{ date: string; value: number; count: number }> = [];
    for (let d = new Date(range.start); d.getTime() <= range.end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key);
      days.push({ date: key, value: row?.value ?? 0, count: row?.count ?? 0 });
    }
    return days;
  }

  async customerRankings(distributorId: string, query: PeriodQueryDto) {
    const { timezone, period } = await this.resolve(distributorId, query);
    const limit = query.limit ?? 10;

    const [rankings, totalRow, earliest] = await Promise.all([
      this.prisma.$queryRaw<Array<{ customerId: string; customerName: string; value: number; orderCount: number }>>`
        SELECT s."traderCustomerId" AS "customerId", o.name AS "customerName",
          COALESCE(SUM(s."subtotalAmount"), 0)::float AS value, COUNT(*)::int AS "orderCount"
        FROM order_analytics_state s
        JOIN organisations o ON o.id = s."traderCustomerId"
        WHERE s."distributorId" = ${distributorId}
          AND s."distributorLocalDate" BETWEEN ${period.current.start} AND ${period.current.end}
          AND s.status IN ${QUALIFYING_STATUSES}
        GROUP BY s."traderCustomerId", o.name
        ORDER BY value DESC
        LIMIT ${limit}
      `,
      this.summaryRow(distributorId, period.current),
      this.earliestDataDate(distributorId),
    ]);

    const customerIds = rankings.map((r) => r.customerId);
    const comparisonByCustomer = period.comparison && customerIds.length > 0
      ? await this.prisma.$queryRaw<Array<{ customerId: string; value: number }>>`
          SELECT "traderCustomerId" AS "customerId", COALESCE(SUM("subtotalAmount"), 0)::float AS value
          FROM order_analytics_state
          WHERE "distributorId" = ${distributorId}
            AND "distributorLocalDate" BETWEEN ${period.comparison.start} AND ${period.comparison.end}
            AND status IN ${QUALIFYING_STATUSES}
            AND "traderCustomerId" IN (${Prisma.join(customerIds)})
          GROUP BY "traderCustomerId"
        `
      : [];
    const comparisonMap = new Map(comparisonByCustomer.map((r) => [r.customerId, r.value]));
    const comparisonEnd = period.comparison?.end ?? period.current.start;

    const totalValue = totalRow.orderValue;
    const top5Value = rankings.slice(0, 5).reduce((sum, r) => sum + r.value, 0);

    return {
      distributorId,
      timezone,
      period: this.periodMeta(query.period ?? 'month', period.current),
      comparisonPeriod: period.comparison ? this.periodMeta(query.period ?? 'month', period.comparison) : null,
      generatedAt: new Date().toISOString(),
      totalQualifyingValue: totalValue,
      top5Share: totalValue > 0 ? top5Value / totalValue : null,
      customers: rankings.map((r) => ({
        customerId: r.customerId,
        customerName: r.customerName,
        value: r.value,
        orderCount: r.orderCount,
        share: totalValue > 0 ? r.value / totalValue : null,
        change: classifyComparison(r.value, comparisonMap.get(r.customerId) ?? 0, earliest, comparisonEnd),
      })),
    };
  }

  async productRankings(distributorId: string, query: PeriodQueryDto) {
    const { timezone, period } = await this.resolve(distributorId, query);
    const limit = query.limit ?? 10;

    const [rankings, nonSelling] = await Promise.all([
      this.prisma.$queryRaw<Array<{ productId: string; productName: string; value: number; units: number; reach: number }>>`
        SELECT olf."productId" AS "productId", p.name AS "productName",
          COALESCE(SUM(olf."netValue"), 0)::float AS value,
          COALESCE(SUM(olf.quantity), 0)::int AS units,
          COUNT(DISTINCT olf."traderCustomerId")::int AS reach
        FROM order_line_facts olf
        JOIN order_analytics_state s ON s."orderId" = olf."orderId"
        JOIN products p ON p.id = olf."productId"
        WHERE olf."distributorId" = ${distributorId}
          AND olf."distributorLocalDate" BETWEEN ${period.current.start} AND ${period.current.end}
          AND s.status IN ${QUALIFYING_STATUSES}
        GROUP BY olf."productId", p.name
        ORDER BY value DESC
        LIMIT ${limit}
      `,
      this.prisma.$queryRaw<Array<{ productId: string; productName: string }>>`
        SELECT p.id AS "productId", p.name AS "productName"
        FROM products p
        WHERE p."distributorId" = ${distributorId}
          AND p.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM order_line_facts olf
            JOIN order_analytics_state s ON s."orderId" = olf."orderId"
            WHERE olf."productId" = p.id
              AND olf."distributorLocalDate" BETWEEN ${period.current.start} AND ${period.current.end}
              AND s.status IN ${QUALIFYING_STATUSES}
          )
        ORDER BY p.name
      `,
    ]);

    return {
      distributorId,
      timezone,
      period: this.periodMeta(query.period ?? 'month', period.current),
      comparisonPeriod: period.comparison ? this.periodMeta(query.period ?? 'month', period.comparison) : null,
      generatedAt: new Date().toISOString(),
      products: rankings,
      nonSellingProducts: nonSelling,
    };
  }

  async actionItems(distributorId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [awaitingAcceptance, dueForFulfilment, invoiceFailures, neverOrdered] = await Promise.all([
      this.prisma.order.findMany({
        where: { distributorId, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'asc' },
        select: { id: true, orderNumber: true, traderCustomerId: true, submittedAt: true, totalAmount: true },
      }),
      this.prisma.order.findMany({
        where: { distributorId, status: 'ACCEPTED', requestedDeliveryDate: { lte: today } },
        orderBy: { requestedDeliveryDate: 'asc' },
        select: { id: true, orderNumber: true, traderCustomerId: true, requestedDeliveryDate: true, totalAmount: true },
      }),
      this.prisma.accountingInvoiceExport.findMany({
        where: { distributorId, status: 'FAILED' },
        select: { id: true, orderId: true, errorCode: true, errorMessage: true, failedAt: true },
      }),
      this.prisma.$queryRaw<Array<{ customerId: string; customerName: string }>>`
        SELECT tr."customerId" AS "customerId", o.name AS "customerName"
        FROM trade_relationships tr
        JOIN organisations o ON o.id = tr."customerId"
        WHERE tr."distributorId" = ${distributorId}
          AND tr.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM order_analytics_state s
            WHERE s."distributorId" = tr."distributorId" AND s."traderCustomerId" = tr."customerId"
          )
        ORDER BY o.name
      `,
    ]);

    return {
      distributorId,
      generatedAt: new Date().toISOString(),
      awaitingAcceptance,
      dueForFulfilment,
      invoiceFailures,
      neverOrdered,
    };
  }
}
