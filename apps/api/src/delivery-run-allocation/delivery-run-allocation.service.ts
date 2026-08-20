import { Injectable, Logger } from '@nestjs/common';
import {
  ActorType,
  DeliveryAllocationSource,
  DeliveryRunStatus,
  Order,
  Prisma,
} from '@prisma/client';
import { UnallocatedReason } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';

// Re-exported for existing callers (e.g. this module's own spec files);
// the type itself now lives in @wholo/types since the Delivery Runs board
// (apps/api/src/delivery-runs/) derives the same reasons at read time and
// needs the same union on the frontend.
export type { UnallocatedReason };

export type AllocationOutcome =
  | { allocated: true; runId: string; deliverySequence: number | null }
  | { allocated: false; reason: UnallocatedReason };

@Injectable()
export class DeliveryRunAllocationService {
  private readonly logger = new Logger(DeliveryRunAllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  // Resolves the customer's active route, finds-or-lazily-creates that route's
  // run for the order's scheduled date, and allocates the order into it.
  //
  // Deliberately idempotent and safe to re-run: an order that already has an
  // active allocation is left alone (the DB's activeOrderId unique constraint
  // is the real guarantee — this check just avoids a pointless P2002).
  async allocateOrder(order: Order, actorUserId?: string): Promise<AllocationOutcome> {
    const scheduledDeliveryDate = order.scheduledDeliveryDate ?? order.requestedDeliveryDate;
    if (!scheduledDeliveryDate) {
      return { allocated: false, reason: 'NO_SCHEDULED_DATE' };
    }

    // First allocation also fixes the scheduled date from the customer's
    // request; requestedDeliveryDate is never touched again after this.
    if (!order.scheduledDeliveryDate) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { scheduledDeliveryDate },
      });
    }

    const routeCustomer = await this.prisma.deliveryRouteCustomer.findFirst({
      where: {
        activeDistributorCustomerId: `${order.distributorId}:${order.traderCustomerId}`,
      },
      include: { route: true },
    });
    if (!routeCustomer || !routeCustomer.route.active) {
      return { allocated: false, reason: 'NO_ROUTE' };
    }

    const run = await this.findOrCreateRun(
      order.distributorId,
      routeCustomer.route.id,
      routeCustomer.route.name,
      routeCustomer.route.defaultDriverName,
      scheduledDeliveryDate,
    );

    // Never add to a locked run — the order stays unassigned with a reason
    // rather than silently changing a run someone has already marked Ready.
    if (run.status === DeliveryRunStatus.READY) {
      return { allocated: false, reason: 'RUN_READY' };
    }

    const existing = await this.prisma.deliveryRunOrder.findFirst({
      where: { activeOrderId: order.id },
      select: { id: true, runId: true, deliverySequence: true },
    });
    if (existing) {
      return { allocated: true, runId: existing.runId, deliverySequence: existing.deliverySequence };
    }

    const deliverySequence = routeCustomer.defaultDropPosition;

    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryRunOrder.create({
        data: {
          runId: run.id,
          orderId: order.id,
          deliverySequence,
          allocationSource: DeliveryAllocationSource.DEFAULT_ROUTE,
          ...(actorUserId ? { assignedByUserId: actorUserId } : {}),
        },
      });
      await tx.deliveryRun.update({
        where: { id: run.id },
        data: { version: { increment: 1 } },
      });
      await this.outbox.writeEvent(tx, 'DeliveryRun', run.id, 'DeliveryRunOrderAllocated', {
        runId: run.id,
        routeId: run.routeId,
        orderId: order.id,
        distributorId: order.distributorId,
        traderCustomerId: order.traderCustomerId,
        deliveryDate: toIsoDate(scheduledDeliveryDate),
        deliverySequence,
        allocationSource: DeliveryAllocationSource.DEFAULT_ROUTE,
        occurredAt: new Date().toISOString(),
      });
      await this.audit.record(tx, {
        distributorId: order.distributorId,
        entityType: 'DELIVERY_RUN',
        entityId: run.id,
        action: 'DELIVERY_RUN_ORDER_ALLOCATED',
        actorType: actorUserId ? ActorType.USER : ActorType.SYSTEM,
        ...(actorUserId ? { actorUserId } : {}),
        summary: `Order ${order.orderNumber} allocated to run ${run.name} for ${toIsoDate(scheduledDeliveryDate)}`,
        changes: { orderId: order.id, runId: run.id, deliverySequence },
      });
    });

    return { allocated: true, runId: run.id, deliverySequence };
  }

  // Find-or-create keyed on the (distributorId, routeId, deliveryDate) unique
  // constraint. Two orders racing to create the same day's run settle on the
  // constraint rather than a check-then-create race, so exactly one run is
  // created and the loser re-reads it.
  //
  // Public (not private) so the change-delivery-date action
  // (delivery-runs.service.ts) can resolve/create the destination run
  // through the exact same code path rather than a second reimplementation —
  // unlike deriveReason's read-only lookup (which is deliberately duplicated
  // with its own comment), a run *creation* path must never exist twice.
  async findOrCreateRun(
    distributorId: string,
    routeId: string,
    routeName: string,
    defaultDriverName: string | null,
    deliveryDate: Date,
  ) {
    const existing = await this.prisma.deliveryRun.findUnique({
      where: { distributorId_routeId_deliveryDate: { distributorId, routeId, deliveryDate } },
    });
    if (existing) return existing;

    try {
      const created = await this.prisma.deliveryRun.create({
        data: {
          distributorId,
          routeId,
          deliveryDate,
          // Snapshot: renaming the route later must not relabel runs that
          // already happened under the old name.
          name: routeName,
          driverName: defaultDriverName,
        },
      });
      this.logger.log(`Created delivery run ${created.id} (${routeName}) for ${toIsoDate(deliveryDate)}`);
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.deliveryRun.findUniqueOrThrow({
          where: { distributorId_routeId_deliveryDate: { distributorId, routeId, deliveryDate } },
        });
      }
      throw err;
    }
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
