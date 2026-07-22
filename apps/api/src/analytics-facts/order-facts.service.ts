import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';

export interface OrderEventPayload {
  orderId: string;
  distributorId: string;
  traderCustomerId: string;
  status: OrderStatus;
  occurredAt: string;
}

// Consumes OrderSubmitted/OrderAccepted/OrderRejected/OrderCancelled to build
// the dashboard analytics fact layer (see the wholesaler homepage dashboard
// PRD's Foundation phase): an immutable order_facts/order_line_facts event
// log, plus order_analytics_state — a one-row-per-order current-truth
// projection that Phase 1's dashboard queries read directly.
//
// This service only records what happened; "qualifying order" filtering is a
// read-side concern for the future analytics query layer, not encoded here.
@Injectable()
export class OrderFactsService {
  private readonly logger = new Logger(OrderFactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleOrderEvent(eventId: string, eventType: string, payload: OrderEventPayload): Promise<void> {
    const { orderId, distributorId, traderCustomerId, status, occurredAt: occurredAtIso } = payload;
    const occurredAt = new Date(occurredAtIso);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { subtotalAmount: true },
    });
    if (!order) {
      this.logger.warn(`Order ${orderId} not found — skipping fact recording for event ${eventId}`);
      return;
    }

    const settings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { timezone: true },
    });
    const localDate = distributorLocalDate(occurredAt, settings?.timezone ?? 'UTC');

    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.orderFact.create({
          data: {
            eventId,
            distributorId,
            orderId,
            traderCustomerId,
            eventType,
            resultingStatus: status,
            subtotalAmount: order.subtotalAmount,
            occurredAt,
            distributorLocalDate: localDate,
          },
        });
      } catch (err) {
        // Replayed event (at-least-once delivery, or a retried job): the
        // eventId+occurredAt primary key already exists, meaning this exact
        // event's full effect (line facts + state upsert below) already
        // committed in a prior attempt. Nothing left to do.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          this.logger.log(`Event ${eventId} already recorded as a fact — skipping (idempotent replay)`);
          return;
        }
        throw err;
      }

      if (eventType === 'OrderSubmitted') {
        const lines = await tx.orderLine.findMany({
          where: { orderId },
          select: { id: true, productId: true, quantityOrdered: true, subtotalAmount: true },
        });
        if (lines.length > 0) {
          await tx.orderLineFact.createMany({
            data: lines.map((line) => ({
              eventId,
              orderLineId: line.id,
              distributorId,
              orderId,
              productId: line.productId,
              traderCustomerId,
              quantity: line.quantityOrdered,
              netValue: line.subtotalAmount,
              occurredAt,
              distributorLocalDate: localDate,
            })),
            skipDuplicates: true,
          });
        }
      }

      await this.upsertAnalyticsState(tx, {
        orderId,
        distributorId,
        traderCustomerId,
        status,
        subtotalAmount: order.subtotalAmount,
        distributorLocalDate: localDate,
        occurredAt,
      });
    });
  }

  /**
   * Applies one order-lifecycle event's effect to `order_analytics_state`,
   * guarded so only a genuinely newer event (by business time, not processing
   * time) can move the row — required so late/out-of-order delivery (PRD
   * §6.2) can never regress a fresher status back to a stale one.
   * `distributorLocalDate` is set only on first insert and never overwritten,
   * so an order's period attribution stays fixed to whichever event created
   * the row (expected to be `OrderSubmitted`) regardless of later status
   * changes. Shared by the live consumer and the rebuild command — the two
   * must never diverge in how they derive state from facts.
   */
  async upsertAnalyticsState(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      distributorId: string;
      traderCustomerId: string;
      status: OrderStatus;
      subtotalAmount: Prisma.Decimal;
      distributorLocalDate: Date;
      occurredAt: Date;
    },
  ): Promise<void> {
    const { orderId, distributorId, traderCustomerId, status, subtotalAmount, distributorLocalDate: localDate, occurredAt } = params;
    await tx.$executeRaw`
      INSERT INTO order_analytics_state
        ("orderId", "distributorId", "traderCustomerId", "status", "subtotalAmount", "distributorLocalDate", "lastEventAt", "updatedAt")
      VALUES
        (${orderId}, ${distributorId}, ${traderCustomerId}, ${status}::"OrderStatus", ${subtotalAmount}, ${localDate}, ${occurredAt}, now())
      ON CONFLICT ("orderId") DO UPDATE SET
        "status" = EXCLUDED."status",
        "subtotalAmount" = EXCLUDED."subtotalAmount",
        "lastEventAt" = EXCLUDED."lastEventAt",
        "updatedAt" = now()
      WHERE order_analytics_state."lastEventAt" < EXCLUDED."lastEventAt"
    `;
  }
}
