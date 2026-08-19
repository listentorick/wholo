import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, DeliveryRunStatus, Prisma } from '@prisma/client';
import { UnallocatedReason } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';

const CUSTOMER_SELECT = { id: true, name: true } satisfies Prisma.OrganisationSelect;

const MAX_LIST_DAYS_WINDOW = 31;

interface ReasonResult {
  reason: UnallocatedReason | null;
  suggestedRunId: string | null;
  suggestedRouteName: string | null;
}

@Injectable()
export class DeliveryRunsService {
  constructor(
    private prisma: PrismaService,
    // Unused in M3a — imported now so M3b's mutation methods (which write
    // outbox events + audit rows in the same transaction as the domain
    // write, per the delivery-run-allocation.service.ts template) don't
    // need a module/constructor edit.
    private outbox: OutboxService,
    private audit: AuditService,
  ) {}

  // Five queries, no N+1: (1) runs + active allocations, (2) unassigned
  // candidates, (3) batched route lookup, (4) batched run lookup for
  // suggestions/RUN_READY, (5) one grouped rollup. Never findOrCreateRun —
  // a GET must not create a run.
  async getDay(distributorId: string, date: string) {
    const day = new Date(`${date}T00:00:00.000Z`); // @db.Date round-trips as UTC midnight

    const runs = await this.prisma.deliveryRun.findMany({
      where: { distributorId, deliveryDate: day },
      orderBy: { createdAt: 'asc' },
      include: {
        orders: {
          where: { removedAt: null },
          orderBy: [{ deliverySequence: 'asc' }, { assignedAt: 'asc' }],
          include: {
            order: { include: { customer: { select: CUSTOMER_SELECT } } },
          },
        },
      },
    });

    const unassignedOrders = await this.prisma.order.findMany({
      where: {
        distributorId,
        status: OrderStatus.ACCEPTED,
        OR: [
          { scheduledDeliveryDate: day },
          { AND: [{ scheduledDeliveryDate: null }, { requestedDeliveryDate: day }] },
        ],
        deliveryRunOrders: { none: { removedAt: null } },
      },
      include: { customer: { select: CUSTOMER_SELECT } },
    });

    const allOrders = [...runs.flatMap((r) => r.orders.map((o) => o.order)), ...unassignedOrders];
    const customerKeys = [...new Set(allOrders.map((o) => `${distributorId}:${o.traderCustomerId}`))];

    const routeCustomers = customerKeys.length
      ? await this.prisma.deliveryRouteCustomer.findMany({
        where: { activeDistributorCustomerId: { in: customerKeys } },
        include: { route: { select: { id: true, name: true, active: true } } },
      })
      : [];
    const routeByCustomerKey = new Map(routeCustomers.map((rc) => [rc.activeDistributorCustomerId!, rc]));

    const routeIds = [...new Set(routeCustomers.map((rc) => rc.route.id))];
    const candidateRuns = routeIds.length
      ? await this.prisma.deliveryRun.findMany({
        where: { distributorId, deliveryDate: day, routeId: { in: routeIds } },
        select: { id: true, routeId: true, status: true },
      })
      : [];
    const runByRouteId = new Map(candidateRuns.map((r) => [r.routeId!, r]));

    const orderIds = allOrders.map((o) => o.id);
    const rollup = orderIds.length
      ? await this.prisma.$queryRaw<Array<{ orderId: string; itemCount: number; lineCount: number }>>`
        SELECT "orderId", SUM("quantityOrdered")::int AS "itemCount", COUNT(*)::int AS "lineCount"
        FROM order_lines WHERE "orderId" IN (${Prisma.join(orderIds)}) GROUP BY "orderId"
      `
      : [];
    const rollupByOrderId = new Map(rollup.map((r) => [r.orderId, r]));

    return {
      distributorId,
      date,
      runs: runs.map((run) => {
        const cards = run.orders.map((ro, index) => this.formatCard(ro.order, rollupByOrderId, {
          stopNumber: index + 1,
          allocationSource: ro.allocationSource,
          attention: 'NONE',
          reason: null,
          suggestedRunId: null,
          suggestedRouteName: null,
        }));
        return {
          runId: run.id,
          routeId: run.routeId,
          name: run.name,
          driverName: run.driverName,
          status: run.status,
          version: run.version,
          cards,
          // Card count, not distinct customers — two orders for one
          // customer are two stops, since a stop is a thing the driver
          // hands over. Deliberate, do not "fix".
          stopCount: cards.length,
          itemCount: cards.reduce((sum, c) => sum + c.itemCount, 0),
        };
      }),
      unassigned: unassignedOrders.map((order) => {
        const { reason, suggestedRunId, suggestedRouteName } = this.deriveReason(
          distributorId,
          order,
          routeByCustomerKey,
          runByRouteId,
        );
        return this.formatCard(order, rollupByOrderId, {
          stopNumber: null,
          allocationSource: null,
          attention: 'UNASSIGNED',
          reason,
          suggestedRunId,
          suggestedRouteName,
        });
      }),
    };
  }

  async listDays(distributorId: string, from: string, to: string) {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    const windowDays = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (windowDays < 1 || windowDays > MAX_LIST_DAYS_WINDOW) {
      throw new BadRequestException(`Date window must be between 1 and ${MAX_LIST_DAYS_WINDOW} days`);
    }

    const runRows = await this.prisma.$queryRaw<Array<{ date: string; runCount: number; runStopCount: number }>>`
      SELECT dr."deliveryDate"::text AS date,
        COUNT(DISTINCT dr.id)::int AS "runCount",
        COUNT(dro.id)::int AS "runStopCount"
      FROM delivery_runs dr
      LEFT JOIN delivery_run_order dro ON dro."runId" = dr.id AND dro."removedAt" IS NULL
      WHERE dr."distributorId" = ${distributorId} AND dr."deliveryDate" BETWEEN ${fromDate} AND ${toDate}
      GROUP BY dr."deliveryDate"
    `;
    const unassignedRows = await this.prisma.$queryRaw<Array<{ date: string; unassignedCount: number }>>`
      SELECT COALESCE(o."scheduledDeliveryDate", o."requestedDeliveryDate")::text AS date,
        COUNT(*)::int AS "unassignedCount"
      FROM orders o
      WHERE o."distributorId" = ${distributorId} AND o.status = ${OrderStatus.ACCEPTED}::"OrderStatus"
        AND COALESCE(o."scheduledDeliveryDate", o."requestedDeliveryDate") BETWEEN ${fromDate} AND ${toDate}
        AND NOT EXISTS (
          SELECT 1 FROM delivery_run_order dro2 WHERE dro2."orderId" = o.id AND dro2."removedAt" IS NULL
        )
      GROUP BY 1
    `;

    const runsByDate = new Map(runRows.map((r) => [r.date.slice(0, 10), r]));
    const unassignedByDate = new Map(unassignedRows.map((r) => [r.date.slice(0, 10), r]));

    const data = [];
    for (let i = 0; i < windowDays; i++) {
      const d = new Date(fromDate);
      d.setUTCDate(d.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const runRow = runsByDate.get(dateStr);
      const unassignedRow = unassignedByDate.get(dateStr);
      const unassignedCount = unassignedRow?.unassignedCount ?? 0;
      data.push({
        date: dateStr,
        runCount: runRow?.runCount ?? 0,
        stopCount: (runRow?.runStopCount ?? 0) + unassignedCount,
        unassignedCount,
      });
    }

    return { data };
  }

  // Reproduces DeliveryRunAllocationService.allocateOrder's branch order
  // exactly (apps/api/src/delivery-run-allocation/delivery-run-allocation.service.ts)
  // so the board's "why unassigned" always matches what allocation would do.
  private deriveReason(
    distributorId: string,
    order: { traderCustomerId: string; scheduledDeliveryDate: Date | null; requestedDeliveryDate: Date | null },
    routeByCustomerKey: Map<string, { route: { id: string; name: string; active: boolean } }>,
    runByRouteId: Map<string, { id: string; status: DeliveryRunStatus }>,
  ): ReasonResult {
    const date = order.scheduledDeliveryDate ?? order.requestedDeliveryDate;
    if (!date) return { reason: 'NO_SCHEDULED_DATE', suggestedRunId: null, suggestedRouteName: null };

    const rc = routeByCustomerKey.get(`${distributorId}:${order.traderCustomerId}`);
    if (!rc || !rc.route.active) return { reason: 'NO_ROUTE', suggestedRunId: null, suggestedRouteName: null };

    const run = runByRouteId.get(rc.route.id);
    if (run?.status === DeliveryRunStatus.READY) {
      return { reason: 'RUN_READY', suggestedRunId: run.id, suggestedRouteName: rc.route.name };
    }
    // No run row yet is allocatable, not unallocated — null reason, but
    // still surface the route as a suggested target.
    return { reason: null, suggestedRunId: run?.id ?? null, suggestedRouteName: rc.route.name };
  }

  private formatCard(
    order: {
      id: string; orderNumber: string; traderCustomerId: string;
      deliveryAddressSnapshot: Prisma.JsonValue; scheduledDeliveryDate: Date | null; requestedDeliveryDate: Date | null;
      customer: { name: string };
    },
    rollupByOrderId: Map<string, { itemCount: number; lineCount: number }>,
    opts: {
      stopNumber: number | null;
      allocationSource: string | null;
      attention: 'NONE' | 'UNASSIGNED' | 'MISSED';
      reason: UnallocatedReason | null;
      suggestedRunId: string | null;
      suggestedRouteName: string | null;
    },
  ) {
    const rollup = rollupByOrderId.get(order.id);
    const deliveryDate = order.scheduledDeliveryDate ?? order.requestedDeliveryDate;
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      traderCustomerId: order.traderCustomerId,
      customerName: order.customer.name,
      deliveryAddress: order.deliveryAddressSnapshot as Record<string, unknown> | null,
      stopNumber: opts.stopNumber,
      lineCount: rollup?.lineCount ?? 0,
      itemCount: rollup?.itemCount ?? 0,
      attention: opts.attention,
      unallocatedReason: opts.reason,
      suggestedRunId: opts.suggestedRunId,
      suggestedRouteName: opts.suggestedRouteName,
      scheduledDeliveryDate: deliveryDate ? deliveryDate.toISOString().slice(0, 10) : null,
      allocationSource: opts.allocationSource,
    };
  }
}
