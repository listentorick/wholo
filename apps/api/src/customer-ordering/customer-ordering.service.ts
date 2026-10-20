import { Injectable, NotFoundException } from '@nestjs/common';
import type { CustomerOrderingBehaviour } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { QUALIFYING_ORDER_STATUSES } from '../analytics/analytics.service';
import { daysBetween, orderingPeriods, orderingTrend } from './customer-ordering.logic';

const PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Line facts are stored by when the event happened; a line's local date can
// fall a day either side of its UTC timestamp, so the occurredAt bound (which
// lets Timescale skip old chunks) starts a little before the period.
const OCCURRED_AT_MARGIN_DAYS = 2;

const asDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;

// How a customer orders from one distributor: recency, frequency, monetary
// value and product breadth over the last 30 days (ADR-077). History, so it is
// read from the analytics state and facts (order_analytics_state,
// order_line_facts), counting qualifying orders only — the same rules as the
// Sales and Customers dashboards. Every query is scoped by distributorId.
@Injectable()
export class CustomerOrderingService {
  constructor(private readonly prisma: PrismaService) {}

  async getBehaviour(distributorId: string, customerId: string, now: Date = new Date()): Promise<CustomerOrderingBehaviour> {
    const [relationship, settings] = await Promise.all([
      this.prisma.tradeRelationship.findUnique({
        where: { distributorId_customerId: { distributorId, customerId } },
        select: { id: true },
      }),
      this.prisma.distributorSettings.findUnique({ where: { distributorId }, select: { timezone: true, currencyCode: true } }),
    ]);
    if (!relationship) throw new NotFoundException('Customer not found');

    const today = isoDate(distributorLocalDate(now, settings?.timezone ?? 'UTC'));
    const currency = settings?.currencyCode ?? 'GBP';
    const periods = orderingPeriods(today, PERIOD_DAYS);
    const qualifying = { distributorId, traderCustomerId: customerId, status: { in: QUALIFYING_ORDER_STATUSES } };
    const inRange = (start: string, end: string) => ({ ...qualifying, distributorLocalDate: { gte: asDate(start), lte: asDate(end) } });

    const [lastOrder, firstOrder, current, previous, currentOrders] = await Promise.all([
      this.prisma.orderAnalyticsState.findFirst({ where: qualifying, orderBy: { distributorLocalDate: 'desc' }, select: { distributorLocalDate: true } }),
      this.prisma.orderAnalyticsState.findFirst({ where: qualifying, orderBy: { distributorLocalDate: 'asc' }, select: { distributorLocalDate: true } }),
      this.prisma.orderAnalyticsState.aggregate({
        where: inRange(periods.periodStart, periods.periodEnd),
        _count: { _all: true },
        _sum: { subtotalAmount: true },
      }),
      this.prisma.orderAnalyticsState.aggregate({
        where: inRange(periods.previousStart, periods.previousEnd),
        _sum: { subtotalAmount: true },
      }),
      this.prisma.orderAnalyticsState.findMany({ where: inRange(periods.periodStart, periods.periodEnd), select: { orderId: true } }),
    ]);

    const products =
      currentOrders.length === 0
        ? []
        : await this.prisma.orderLineFact.findMany({
            where: {
              distributorId,
              traderCustomerId: customerId,
              orderId: { in: currentOrders.map((o) => o.orderId) },
              occurredAt: { gte: new Date(asDate(periods.periodStart).getTime() - OCCURRED_AT_MARGIN_DAYS * DAY_MS) },
            },
            distinct: ['productId'],
            select: { productId: true },
          });

    const lastOrderDate = lastOrder ? isoDate(lastOrder.distributorLocalDate) : null;
    const currentSpend = round(Number(current._sum.subtotalAmount ?? 0));
    const previousSpend = round(Number(previous._sum.subtotalAmount ?? 0));
    return {
      customerId,
      asOf: today,
      periodDays: PERIOD_DAYS,
      periodStart: periods.periodStart,
      periodEnd: periods.periodEnd,
      recency: { lastOrderDate, daysSinceLastOrder: lastOrderDate ? daysBetween(lastOrderDate, today) : null },
      frequency: { orders: current._count._all },
      monetary: { amounts: current._count._all === 0 ? [] : [{ currency, amount: currentSpend }] },
      productBreadth: { distinctProducts: products.length },
      trend: orderingTrend({
        firstOrderDate: firstOrder ? isoDate(firstOrder.distributorLocalDate) : null,
        previousStart: periods.previousStart,
        currentSpend,
        previousSpend,
      }),
    };
  }
}
