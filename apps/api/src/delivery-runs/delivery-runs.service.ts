import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import {
  ActorType, DeliveryAllocationSource, OrderStatus, DeliveryRunStatus, Prisma,
} from '@prisma/client';
import { UnallocatedReason } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { DeliveryRunAllocationService } from '../delivery-run-allocation/delivery-run-allocation.service';
import { AssignOrderToRunDto } from './dto/assign-order-to-run.dto';
import { ReorderRunOrdersDto } from './dto/reorder-run-orders.dto';
import { UpdateDeliveryRunDto } from './dto/update-delivery-run.dto';
import { ChangeScheduledDeliveryDateDto } from './dto/change-scheduled-delivery-date.dto';

const CUSTOMER_SELECT = { id: true, name: true } satisfies Prisma.OrganisationSelect;

const MAX_LIST_DAYS_WINDOW = 31;

const DEFAULT_NEARBY_DELIVERY_WINDOW_DAYS = 3;

type ResolutionOutcome =
  | { allocated: true; runId: string; runName: string }
  | { allocated: false; reason: UnallocatedReason };

interface ReasonResult {
  reason: UnallocatedReason | null;
  suggestedRunId: string | null;
  suggestedRouteName: string | null;
}

@Injectable()
export class DeliveryRunsService {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
    private audit: AuditService,
    private allocation: DeliveryRunAllocationService,
  ) {}

  // Five queries, no N+1: (1) runs + active allocations, (2) unassigned
  // candidates, (3) batched route lookup, (4) batched run lookup for
  // suggestions/RUN_READY, (5) one grouped rollup. Never findOrCreateRun —
  // a GET must not create a run.
  async getDay(distributorId: string, date: string) {
    const day = new Date(`${date}T00:00:00.000Z`); // @db.Date round-trips as UTC midnight

    // MISSED applies only to still-unassigned cards on a past day — there is
    // no delivery-completion signal anywhere in the schema
    // (DeliveryRunOrderStatus has only PLANNED), so a card sitting inside a
    // run on a past date can't be told apart from "delivered fine". An order
    // that was never allocated and whose date has passed is unambiguous:
    // nobody was ever going to deliver it.
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const isPastDay = day.getTime() < today.getTime();

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
          attention: isPastDay ? 'MISSED' : 'UNASSIGNED',
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

  // Assigns an order into a run — either from Unassigned (no sourceRunId)
  // or as a cross-run move (sourceRunId set). Two different CAS targets,
  // deliberately: the destination run is CAS'd on `version`; the source is
  // CAS'd on the allocation row itself (activeOrderId + runId) — "this
  // delivery is still where the caller thinks it is" is the real invariant,
  // stronger than a version compare.
  async assignOrderToRun(distributorId: string, runId: string, dto: AssignOrderToRunDto, actorUserId: string) {
    const destination = await this.prisma.deliveryRun.findFirst({ where: { id: runId, distributorId } });
    if (!destination) throw new NotFoundException('Delivery run not found');
    if (destination.status === DeliveryRunStatus.READY) {
      throw new UnprocessableEntityException('Cannot assign into a run that is already marked ready');
    }

    const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, distributorId } });
    if (!order) throw new NotFoundException('Order not found');

    const orderDate = order.scheduledDeliveryDate ?? order.requestedDeliveryDate;
    if (!orderDate || orderDate.getTime() !== destination.deliveryDate.getTime()) {
      throw new UnprocessableEntityException(
        `Order is scheduled for ${orderDate ? toIsoDate(orderDate) : 'no date'} but run is for ${toIsoDate(destination.deliveryDate)}`,
      );
    }

    const existing = await this.prisma.deliveryRunOrder.findFirst({ where: { activeOrderId: dto.orderId } });
    // No-op guard: already in this exact run — return unchanged, no version
    // bump, no event, so drag jitter/repeat clicks don't spam the outbox.
    if (existing?.runId === runId) {
      return this.getDay(distributorId, toIsoDate(destination.deliveryDate));
    }

    // A READY run's membership is locked until an explicit Reopen — that
    // applies to removal (this cross-run move) exactly as it does to
    // unassignOrderFromRun, not just to the destination check above.
    if (dto.sourceRunId) {
      const sourceRun = await this.prisma.deliveryRun.findFirst({ where: { id: dto.sourceRunId, distributorId } });
      if (sourceRun?.status === DeliveryRunStatus.READY) {
        throw new UnprocessableEntityException('Cannot move a delivery out of a run that is already marked ready');
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. CAS the destination version first — a stale caller causes zero
        // row churn, and ownership folds into the predicate.
        const destUpdate = await tx.deliveryRun.updateMany({
          where: {
            id: runId, distributorId, version: dto.version, status: DeliveryRunStatus.OPEN,
          },
          data: { version: { increment: 1 } },
        });
        if (destUpdate.count !== 1) throw new ConflictException('Delivery run has changed — refresh and try again');

        // 2. Soft-remove the source allocation BEFORE the create. Load-bearing,
        // not stylistic: DeliveryRunOrder.activeOrderId's @@unique is
        // non-deferrable and the ADR-052 trigger nulls it the instant
        // removedAt is set — create-before-remove would have two rows
        // claiming the slot and P2002.
        if (dto.sourceRunId) {
          const srcRemove = await tx.deliveryRunOrder.updateMany({
            where: { activeOrderId: dto.orderId, runId: dto.sourceRunId },
            data: { removedAt: new Date(), removedByUserId: actorUserId },
          });
          if (srcRemove.count !== 1) {
            throw new ConflictException('This delivery has already moved — refresh and try again');
          }
        }

        // 3. Create, splice at position, renumber dense 1..n.
        const siblings = await tx.deliveryRunOrder.findMany({
          where: { runId, removedAt: null },
          orderBy: [{ deliverySequence: 'asc' }, { assignedAt: 'asc' }],
          select: { id: true },
        });
        const created = await tx.deliveryRunOrder.create({
          data: {
            runId,
            orderId: dto.orderId,
            allocationSource: DeliveryAllocationSource.MANUAL,
            assignedByUserId: actorUserId,
          },
        });
        const insertAt = dto.position ? Math.min(dto.position - 1, siblings.length) : siblings.length;
        const ordered = [...siblings.slice(0, insertAt), { id: created.id }, ...siblings.slice(insertAt)];
        await Promise.all(ordered.map((s, index) => tx.deliveryRunOrder.update({
          where: { id: s.id },
          data: { deliverySequence: index + 1 },
        })));

        // 4. Blind-increment the source run's version — step 2 already CAS'd
        // the real invariant; increments commute, no CAS needed here.
        if (dto.sourceRunId && dto.sourceRunId !== runId) {
          await tx.deliveryRun.update({ where: { id: dto.sourceRunId }, data: { version: { increment: 1 } } });
        }

        await this.outbox.writeEvent(tx, 'DeliveryRun', runId, 'DeliveryRunOrderMoved', {
          runId,
          distributorId,
          orderId: dto.orderId,
          sourceRunId: dto.sourceRunId ?? null,
          deliverySequence: insertAt + 1,
          occurredAt: new Date().toISOString(),
        });
        await this.audit.record(tx, {
          distributorId,
          entityType: 'DELIVERY_RUN',
          entityId: runId,
          action: 'DELIVERY_RUN_ORDER_MOVED',
          actorType: ActorType.USER,
          actorUserId,
          summary: `Moved order ${order.orderNumber} into run ${destination.name}`,
          changes: { orderId: dto.orderId, fromRunId: dto.sourceRunId ?? null, toRunId: runId },
        });
      });
    } catch (err) {
      // Backstop for the (sourceRunId omitted) case where the order turns
      // out to already have an active allocation elsewhere — the DB
      // constraint is the real enforcement, this turns the P2002 into a
      // clean conflict rather than a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This order already has an active delivery run allocation — refresh and try again');
      }
      throw err;
    }

    return this.getDay(distributorId, toIsoDate(destination.deliveryDate));
  }

  async unassignOrderFromRun(distributorId: string, runId: string, orderId: string, version: number, actorUserId: string) {
    const run = await this.prisma.deliveryRun.findFirst({ where: { id: runId, distributorId } });
    if (!run) throw new NotFoundException('Delivery run not found');
    if (run.status === DeliveryRunStatus.READY) {
      throw new UnprocessableEntityException('Cannot remove a delivery from a run that is already marked ready');
    }

    const order = await this.prisma.order.findFirst({ where: { id: orderId, distributorId } });
    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.$transaction(async (tx) => {
      const casResult = await tx.deliveryRun.updateMany({
        where: {
          id: runId, distributorId, version, status: DeliveryRunStatus.OPEN,
        },
        data: { version: { increment: 1 } },
      });
      if (casResult.count !== 1) throw new ConflictException('Delivery run has changed — refresh and try again');

      // CAS on the allocation row itself, same reasoning as the source-CAS
      // in assignOrderToRun — this is the "this delivery is still here"
      // invariant, not the run's version.
      const removed = await tx.deliveryRunOrder.updateMany({
        where: { activeOrderId: orderId, runId },
        data: { removedAt: new Date(), removedByUserId: actorUserId },
      });
      if (removed.count !== 1) {
        throw new ConflictException('This delivery has already moved — refresh and try again');
      }

      // Densify the remaining sequence — unlike a cross-run move, there's
      // no destination to seed, so every remaining active row is renumbered.
      const remaining = await tx.deliveryRunOrder.findMany({
        where: { runId, removedAt: null },
        orderBy: [{ deliverySequence: 'asc' }, { assignedAt: 'asc' }],
        select: { id: true },
      });
      await Promise.all(remaining.map((s, index) => tx.deliveryRunOrder.update({
        where: { id: s.id },
        data: { deliverySequence: index + 1 },
      })));

      await this.outbox.writeEvent(tx, 'DeliveryRun', runId, 'DeliveryRunOrderUnassigned', {
        runId, distributorId, orderId, occurredAt: new Date().toISOString(),
      });
      await this.audit.record(tx, {
        distributorId,
        entityType: 'DELIVERY_RUN',
        entityId: runId,
        action: 'DELIVERY_RUN_ORDER_UNASSIGNED',
        actorType: ActorType.USER,
        actorUserId,
        summary: `Removed order ${order.orderNumber} from run ${run.name}`,
        changes: { orderId, runId },
      });
    });

    return this.getDay(distributorId, toIsoDate(run.deliveryDate));
  }

  async reorderRunOrders(distributorId: string, runId: string, dto: ReorderRunOrdersDto, actorUserId: string) {
    const run = await this.prisma.deliveryRun.findFirst({ where: { id: runId, distributorId } });
    if (!run) throw new NotFoundException('Delivery run not found');
    if (run.status === DeliveryRunStatus.READY) {
      throw new UnprocessableEntityException('Cannot reorder a run that is already marked ready');
    }

    const active = await this.prisma.deliveryRunOrder.findMany({
      where: { runId, removedAt: null },
      select: { id: true, orderId: true },
    });
    const activeOrderIds = new Set(active.map((a) => a.orderId));
    const providedOrderIds = new Set(dto.orderedOrderIds);
    const sameSet = activeOrderIds.size === providedOrderIds.size
      && [...activeOrderIds].every((id) => providedOrderIds.has(id));
    if (!sameSet) {
      throw new BadRequestException('orderedOrderIds must contain exactly the run\'s current active orders');
    }

    const idByOrderId = new Map(active.map((a) => [a.orderId, a.id]));

    await this.prisma.$transaction(async (tx) => {
      const casResult = await tx.deliveryRun.updateMany({
        where: {
          id: runId, distributorId, version: dto.version, status: DeliveryRunStatus.OPEN,
        },
        data: { version: { increment: 1 } },
      });
      if (casResult.count !== 1) throw new ConflictException('Delivery run has changed — refresh and try again');

      await Promise.all(dto.orderedOrderIds.map((orderId, index) => tx.deliveryRunOrder.update({
        where: { id: idByOrderId.get(orderId)! },
        data: { deliverySequence: index + 1 },
      })));

      await this.outbox.writeEvent(tx, 'DeliveryRun', runId, 'DeliveryRunOrdersResequenced', {
        runId, distributorId, orderedOrderIds: dto.orderedOrderIds, occurredAt: new Date().toISOString(),
      });
      await this.audit.record(tx, {
        distributorId,
        entityType: 'DELIVERY_RUN',
        entityId: runId,
        action: 'DELIVERY_RUN_ORDERS_RESEQUENCED',
        actorType: ActorType.USER,
        actorUserId,
        summary: `Reordered ${dto.orderedOrderIds.length} deliveries in run ${run.name}`,
        changes: { orderedOrderIds: dto.orderedOrderIds },
      });
    });

    return this.getDay(distributorId, toIsoDate(run.deliveryDate));
  }

  // Mark ready / reopen / driver-override, unified into one PATCH per
  // CLAUDE.md's "prefer coarse resources over fine-grained field endpoints"
  // — these are all just partial updates of the DeliveryRun resource
  // itself, unlike the three mutations above which own the `orders`
  // sub-resource. Driver is locked exactly like membership/sequence: a
  // driver-only change also requires the run to be OPEN, so one CAS
  // predicate (`expectedCurrentStatus`) covers all three cases below.
  async updateRun(distributorId: string, runId: string, dto: UpdateDeliveryRunDto, actorUserId: string) {
    if (dto.status === undefined && dto.driverName === undefined) {
      throw new BadRequestException('At least one of status or driverName must be provided');
    }

    const run = await this.prisma.deliveryRun.findFirst({ where: { id: runId, distributorId } });
    if (!run) throw new NotFoundException('Delivery run not found');

    // Reopening expects the run to currently be READY; going ready or
    // changing the driver both expect it to currently be OPEN.
    const expectedCurrentStatus = dto.status === DeliveryRunStatus.OPEN
      ? DeliveryRunStatus.READY
      : DeliveryRunStatus.OPEN;

    if (run.status !== expectedCurrentStatus) {
      if (dto.status === DeliveryRunStatus.READY) throw new UnprocessableEntityException('Run is already marked ready');
      if (dto.status === DeliveryRunStatus.OPEN) throw new UnprocessableEntityException('Run is not marked ready');
      throw new UnprocessableEntityException('Cannot change driver on a run that is already marked ready');
    }

    const data: Prisma.DeliveryRunUpdateManyMutationInput = { version: { increment: 1 } };
    const auditEntries: Array<{
      eventType: string; auditAction: string; summary: string; changes: Prisma.InputJsonValue;
    }> = [];

    if (dto.status === DeliveryRunStatus.READY) {
      data.status = DeliveryRunStatus.READY;
      data.readyAt = new Date();
      data.readyByUserId = actorUserId;
      auditEntries.push({
        eventType: 'DeliveryRunMarkedReady',
        auditAction: 'DELIVERY_RUN_MARKED_READY',
        summary: `Marked run ${run.name} ready`,
        changes: { status: 'READY' },
      });
    } else if (dto.status === DeliveryRunStatus.OPEN) {
      data.status = DeliveryRunStatus.OPEN;
      data.readyAt = null;
      data.readyByUserId = null;
      auditEntries.push({
        eventType: 'DeliveryRunReopened',
        auditAction: 'DELIVERY_RUN_REOPENED',
        summary: `Reopened run ${run.name}`,
        changes: { status: 'OPEN' },
      });
    }

    if (dto.driverName !== undefined) {
      data.driverName = dto.driverName;
      auditEntries.push({
        eventType: 'DeliveryRunDriverChanged',
        auditAction: 'DELIVERY_RUN_DRIVER_CHANGED',
        summary: dto.driverName
          ? `Set driver for run ${run.name} to ${dto.driverName}`
          : `Cleared the driver for run ${run.name}`,
        changes: { driverName: dto.driverName },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const casResult = await tx.deliveryRun.updateMany({
        where: {
          id: runId, distributorId, version: dto.version, status: expectedCurrentStatus,
        },
        data,
      });
      if (casResult.count !== 1) throw new ConflictException('Delivery run has changed — refresh and try again');

      for (const entry of auditEntries) {
        await this.outbox.writeEvent(tx, 'DeliveryRun', runId, entry.eventType, {
          runId, distributorId, ...(entry.changes as Record<string, unknown>), occurredAt: new Date().toISOString(),
        });
        await this.audit.record(tx, {
          distributorId,
          entityType: 'DELIVERY_RUN',
          entityId: runId,
          action: entry.auditAction,
          actorType: ActorType.USER,
          actorUserId,
          summary: entry.summary,
          changes: entry.changes,
        });
      }
    });

    return this.getDay(distributorId, toIsoDate(run.deliveryDate));
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
      requestedDeliveryDate: order.requestedDeliveryDate ? order.requestedDeliveryDate.toISOString().slice(0, 10) : null,
      allocationSource: opts.allocationSource,
    };
  }

  // Read-only preview: never calls findOrCreateRun (a run that doesn't exist
  // yet for the candidate date is still a valid "would allocate" outcome, not
  // a reason to create it early). Reproduces the same route lookup as
  // DeliveryRunAllocationService.allocateOrder / deriveReason above — see
  // those comments for why this is duplicated rather than shared.
  async getReschedulePreview(distributorId: string, orderId: string, date: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, distributorId } });
    if (!order) throw new NotFoundException('Order not found');

    const targetDate = new Date(`${date}T00:00:00.000Z`);

    const routeCustomer = await this.prisma.deliveryRouteCustomer.findFirst({
      where: { activeDistributorCustomerId: `${distributorId}:${order.traderCustomerId}` },
      include: { route: true },
    });

    let resolution: { allocated: true; runId: string | null; runName: string } | { allocated: false; reason: UnallocatedReason };
    if (!routeCustomer || !routeCustomer.route.active) {
      resolution = { allocated: false, reason: 'NO_ROUTE' };
    } else {
      const run = await this.prisma.deliveryRun.findUnique({
        where: {
          distributorId_routeId_deliveryDate: {
            distributorId, routeId: routeCustomer.route.id, deliveryDate: targetDate,
          },
        },
      });
      resolution = run?.status === DeliveryRunStatus.READY
        ? { allocated: false, reason: 'RUN_READY' }
        : { allocated: true, runId: run?.id ?? null, runName: routeCustomer.route.name };
    }

    const nearbyDeliveries = await this.findNearbyDeliveries(distributorId, order, targetDate);

    return { resolution, nearbyDeliveries };
  }

  // Changes an order's *scheduled* date (the internal replanning date) and
  // synchronously re-resolves its route/run for the new date — unlike M2's
  // allocation, this is an interactive row action, not an acceptance-time
  // trigger, so it must not be deferred to the outbox/worker. The customer's
  // requestedDeliveryDate is never touched. CAS target is the order's own
  // scheduledDeliveryDate (Order has no version column) — the same "CAS on
  // the real invariant" philosophy as assignOrderToRun's source-row CAS.
  async changeScheduledDeliveryDate(
    distributorId: string,
    orderId: string,
    dto: ChangeScheduledDeliveryDateDto,
    actorUserId: string,
  ) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, distributorId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.ACCEPTED) {
      throw new UnprocessableEntityException('Only accepted orders can be rescheduled');
    }

    const currentDateIso = order.scheduledDeliveryDate ? toIsoDate(order.scheduledDeliveryDate) : null;
    if (currentDateIso === dto.scheduledDeliveryDate) {
      throw new BadRequestException('New scheduled delivery date must differ from the current one');
    }

    const newDate = new Date(`${dto.scheduledDeliveryDate}T00:00:00.000Z`);
    const expected = dto.expectedScheduledDeliveryDate
      ? new Date(`${dto.expectedScheduledDeliveryDate}T00:00:00.000Z`)
      : null;

    const previousAllocation = await this.prisma.deliveryRunOrder.findFirst({
      where: { activeOrderId: orderId },
      include: { run: true },
    });
    // A READY run's membership is locked until an explicit Reopen — that
    // applies to a reschedule exactly as it does to a manual move.
    if (previousAllocation?.run.status === DeliveryRunStatus.READY) {
      throw new UnprocessableEntityException('Cannot reschedule a delivery that is already in a run marked ready');
    }

    const routeCustomer = await this.prisma.deliveryRouteCustomer.findFirst({
      where: { activeDistributorCustomerId: `${distributorId}:${order.traderCustomerId}` },
      include: { route: true },
    });

    // Resolve/create the destination run OUTSIDE the CAS transaction below —
    // findOrCreateRun is its own atomic, constraint-settled unit (see its own
    // comment), never nested inside another transaction. Checked here so a
    // destination that's already READY is rejected before any state changes;
    // re-checked again inside the transaction as a race guard.
    let destinationRun: { id: string; name: string; status: DeliveryRunStatus } | null = null;
    if (routeCustomer && routeCustomer.route.active) {
      destinationRun = await this.allocation.findOrCreateRun(
        distributorId,
        routeCustomer.route.id,
        routeCustomer.route.name,
        routeCustomer.route.defaultDriverName,
        newDate,
      );
      if (destinationRun.status === DeliveryRunStatus.READY) {
        throw new UnprocessableEntityException('Cannot reschedule into a run that is already marked ready');
      }
    }

    let allocationResult!: ResolutionOutcome;

    try {
      await this.prisma.$transaction(async (tx) => {
        const casResult = await tx.order.updateMany({
          where: { id: orderId, distributorId, scheduledDeliveryDate: expected },
          data: { scheduledDeliveryDate: newDate },
        });
        if (casResult.count !== 1) {
          throw new ConflictException('This order\'s delivery date has changed — refresh and try again');
        }

        // Soft-remove the old allocation BEFORE creating the new one — same
        // non-deferrable-unique/trigger reasoning as assignOrderToRun.
        if (previousAllocation) {
          const removed = await tx.deliveryRunOrder.updateMany({
            where: { activeOrderId: orderId, runId: previousAllocation.runId },
            data: { removedAt: new Date(), removedByUserId: actorUserId },
          });
          if (removed.count !== 1) {
            throw new ConflictException('This delivery has already moved — refresh and try again');
          }
          const remaining = await tx.deliveryRunOrder.findMany({
            where: { runId: previousAllocation.runId, removedAt: null },
            orderBy: [{ deliverySequence: 'asc' }, { assignedAt: 'asc' }],
            select: { id: true },
          });
          await Promise.all(remaining.map((s, index) => tx.deliveryRunOrder.update({
            where: { id: s.id },
            data: { deliverySequence: index + 1 },
          })));
          await tx.deliveryRun.update({ where: { id: previousAllocation.runId }, data: { version: { increment: 1 } } });
        }

        if (!destinationRun) {
          allocationResult = { allocated: false, reason: 'NO_ROUTE' };
        } else {
          // Race guard: re-check the destination is still OPEN inside the
          // transaction — any throw here rolls back the CAS'd date change
          // and the source soft-remove above.
          const freshDestination = await tx.deliveryRun.findUniqueOrThrow({ where: { id: destinationRun.id } });
          if (freshDestination.status === DeliveryRunStatus.READY) {
            throw new UnprocessableEntityException('Cannot reschedule into a run that is already marked ready');
          }

          const created = await tx.deliveryRunOrder.create({
            data: {
              runId: destinationRun.id,
              orderId,
              allocationSource: DeliveryAllocationSource.MANUAL,
              assignedByUserId: actorUserId,
            },
          });
          const siblings = await tx.deliveryRunOrder.findMany({
            where: { runId: destinationRun.id, removedAt: null, id: { not: created.id } },
            orderBy: [{ deliverySequence: 'asc' }, { assignedAt: 'asc' }],
            select: { id: true },
          });
          const ordered = [...siblings, { id: created.id }];
          await Promise.all(ordered.map((s, index) => tx.deliveryRunOrder.update({
            where: { id: s.id },
            data: { deliverySequence: index + 1 },
          })));
          await tx.deliveryRun.update({ where: { id: destinationRun.id }, data: { version: { increment: 1 } } });

          allocationResult = { allocated: true, runId: destinationRun.id, runName: destinationRun.name };
        }

        await this.outbox.writeEvent(tx, 'Order', orderId, 'OrderScheduledDeliveryDateChanged', {
          orderId,
          distributorId,
          previousScheduledDeliveryDate: currentDateIso,
          scheduledDeliveryDate: dto.scheduledDeliveryDate,
          previousRunId: previousAllocation?.runId ?? null,
          newRunId: allocationResult.allocated ? allocationResult.runId : null,
          occurredAt: new Date().toISOString(),
        });
        await this.audit.record(tx, {
          distributorId,
          entityType: 'ORDER',
          entityId: orderId,
          action: 'ORDER_SCHEDULED_DELIVERY_DATE_CHANGED',
          actorType: ActorType.USER,
          actorUserId,
          summary: `Changed order ${order.orderNumber}'s delivery date to ${dto.scheduledDeliveryDate}`,
          changes: { previousScheduledDeliveryDate: currentDateIso, scheduledDeliveryDate: dto.scheduledDeliveryDate },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This order already has an active delivery run allocation — refresh and try again');
      }
      throw err;
    }

    return {
      orderId,
      scheduledDeliveryDate: dto.scheduledDeliveryDate,
      requestedDeliveryDate: order.requestedDeliveryDate ? toIsoDate(order.requestedDeliveryDate) : null,
      allocation: allocationResult,
    };
  }

  // Same-address match within DistributorSettings.nearbyDeliveryWindowDays
  // (default 3, no settings UI). Reviewable suggestion only — never
  // auto-merged/moved. Address comparison happens in JS (line1+postcode,
  // normalized) since deliveryAddressSnapshot is an opaque JSON blob and the
  // per-distributor/window candidate set is small — not worth a JSON-path
  // SQL predicate.
  private async findNearbyDeliveries(
    distributorId: string,
    order: { id: string; deliveryAddressSnapshot: Prisma.JsonValue },
    targetDate: Date,
  ) {
    const targetAddress = normalizeAddress(order.deliveryAddressSnapshot);
    if (!targetAddress) return [];

    const settings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { nearbyDeliveryWindowDays: true },
    });
    const windowDays = settings?.nearbyDeliveryWindowDays ?? DEFAULT_NEARBY_DELIVERY_WINDOW_DAYS;

    const from = new Date(targetDate);
    from.setUTCDate(from.getUTCDate() - windowDays);
    const to = new Date(targetDate);
    to.setUTCDate(to.getUTCDate() + windowDays);

    const candidates = await this.prisma.order.findMany({
      where: {
        distributorId,
        status: OrderStatus.ACCEPTED,
        id: { not: order.id },
        OR: [
          { scheduledDeliveryDate: { gte: from, lte: to } },
          { AND: [{ scheduledDeliveryDate: null }, { requestedDeliveryDate: { gte: from, lte: to } }] },
        ],
      },
      include: {
        customer: { select: CUSTOMER_SELECT },
        deliveryRunOrders: { where: { removedAt: null }, include: { run: { select: { id: true, name: true } } } },
      },
    });

    return candidates
      .filter((c) => normalizeAddress(c.deliveryAddressSnapshot) === targetAddress)
      .map((c) => {
        const active = c.deliveryRunOrders[0];
        const effectiveDate = c.scheduledDeliveryDate ?? c.requestedDeliveryDate;
        return {
          orderId: c.id,
          orderNumber: c.orderNumber,
          customerName: c.customer.name,
          scheduledDeliveryDate: effectiveDate ? toIsoDate(effectiveDate) : null,
          runId: active?.run.id ?? null,
          runName: active?.run.name ?? null,
        };
      });
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeAddress(snapshot: Prisma.JsonValue): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const s = snapshot as Record<string, unknown>;
  const line1 = typeof s.line1 === 'string' ? s.line1.trim().toLowerCase() : '';
  const postcode = typeof s.postcode === 'string' ? s.postcode.trim().toLowerCase() : '';
  if (!line1 || !postcode) return null;
  return `${line1}|${postcode}`;
}
