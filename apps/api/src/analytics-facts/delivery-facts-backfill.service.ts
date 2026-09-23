import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryFactsService, DeliveryEventPayload, toOrderEventPayload } from './delivery-facts.service';
import { OrderFactsService } from './order-facts.service';

const BACKFILL_INTERVAL_MS = 5 * 60 * 1000;
// An outcome newer than this may simply not have reached the consumer yet
// (outbox polling + queue latency) — not a gap.
const GRACE_PERIOD_MS = 60 * 1000;
const BATCH_SIZE = 200;
const MAX_BATCHES_PER_RUN = 25;

// Self-healing: replays any delivery outcome that has no delivery fact — the
// outcomes recorded before delivery events were routed to the facts queue, and
// any event the consumer ever missed. Idempotent by construction (a synthetic,
// stable eventId per outcome), so running it repeatedly is harmless, and it is
// what makes the reconciliation check for delivered orders converge.
//
// Historic outcomes are attributed to the order's *current* scheduled date and
// allocation, which may since have changed — an approximation that only
// applies to what predates the live events.
@Injectable()
export class DeliveryFactsBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeliveryFactsBackfillService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderFacts: OrderFactsService,
    private readonly deliveryFacts: DeliveryFactsService,
  ) {}

  onApplicationBootstrap(): void {
    void this.tick();
  }

  @Interval(BACKFILL_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const filled = await this.backfillMissing();
      if (filled > 0) this.logger.log(`Backfilled delivery facts for ${filled} outcome(s)`);
    } catch (err) {
      this.logger.error(`Delivery facts backfill failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  async backfillMissing(): Promise<number> {
    let total = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);
      const missing = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT d.id
        FROM order_delivery_outcomes d
        WHERE d."recordedAt" < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM delivery_facts f WHERE f."orderId" = d."orderId")
        ORDER BY d."recordedAt"
        LIMIT ${BATCH_SIZE}
      `;
      if (missing.length === 0) break;

      const outcomes = await this.prisma.orderDeliveryOutcome.findMany({
        where: { id: { in: missing.map((m) => m.id) } },
        include: {
          order: {
            select: {
              id: true, distributorId: true, traderCustomerId: true, scheduledDeliveryDate: true, requestedDeliveryDate: true,
              deliveryRunOrders: { where: { removedAt: null }, take: 1, select: { runId: true, run: { select: { routeId: true } } } },
            },
          },
        },
      });

      for (const outcome of outcomes) {
        const { order } = outcome;
        const allocation = order.deliveryRunOrders[0];
        const eventType = outcome.outcome === 'DELIVERED' ? 'OrderDelivered' : 'OrderDeliveryFailed';
        const eventId = `backfill-outcome-${outcome.id}`;
        const payload: DeliveryEventPayload = {
          orderId: order.id,
          distributorId: order.distributorId,
          traderCustomerId: order.traderCustomerId,
          recordedAt: outcome.recordedAt.toISOString(),
          unableReason: outcome.unableReason,
          outcome: outcome.outcome,
          dropMethod: outcome.dropMethod,
          committedDate: (order.scheduledDeliveryDate ?? order.requestedDeliveryDate)?.toISOString().slice(0, 10) ?? null,
          requestedDate: order.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
          runId: allocation?.runId ?? null,
          routeId: allocation?.run.routeId ?? null,
        };
        await this.orderFacts.handleOrderEvent(eventId, eventType, toOrderEventPayload(eventType, payload));
        await this.deliveryFacts.handleDeliveryEvent(eventId, eventType, payload);
        total++;
      }
      if (missing.length < BATCH_SIZE) break;
    }
    return total;
  }
}
