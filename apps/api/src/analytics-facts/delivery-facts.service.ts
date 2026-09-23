import { Injectable, Logger } from '@nestjs/common';
import { DeliveryDropMethod, DeliveryOutcomeType, OrderStatus, Prisma, UnableToDeliverReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { OrderEventPayload } from './order-facts.service';

// Payload of the OrderDelivered / OrderDeliveryFailed outbox events (written in
// the same transaction as the delivery outcome — see DeliveryLinksService).
// The fields after `unableReason` were added for this consumer, so an event
// already in flight when they were introduced lacks them: treat them as
// optional and derive what can be derived.
export interface DeliveryEventPayload {
  orderId: string;
  distributorId: string;
  traderCustomerId: string;
  recordedAt: string;
  unableReason?: UnableToDeliverReason | null;
  outcome?: DeliveryOutcomeType;
  dropMethod?: DeliveryDropMethod | null;
  committedDate?: string | null;
  requestedDate?: string | null;
  runId?: string | null;
  routeId?: string | null;
}

export const DELIVERY_EVENT_TYPES = new Set(['OrderDelivered', 'OrderDeliveryFailed']);

/**
 * The order-lifecycle view of a delivery event, so the same event also moves
 * order_facts / order_analytics_state to DELIVERED or DELIVERY_FAILED. Without
 * this the state projection stays at ACCEPTED for a delivered order and the
 * reconciliation check reports it as drift.
 */
export function toOrderEventPayload(eventType: string, payload: DeliveryEventPayload): OrderEventPayload {
  return {
    orderId: payload.orderId,
    distributorId: payload.distributorId,
    traderCustomerId: payload.traderCustomerId,
    status: eventType === 'OrderDelivered' ? OrderStatus.DELIVERED : OrderStatus.DELIVERY_FAILED,
    occurredAt: payload.recordedAt,
  };
}

const dateOnly = (iso: string | null | undefined): Date | null => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

// Consumes OrderDelivered / OrderDeliveryFailed into delivery_facts: what was
// observed at the door, with the date the distributor had committed to. Records
// only — "on time" / "late" are read-side derivations (see DeliveryOutcomesService).
@Injectable()
export class DeliveryFactsService {
  private readonly logger = new Logger(DeliveryFactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleDeliveryEvent(eventId: string, eventType: string, payload: DeliveryEventPayload): Promise<void> {
    const occurredAt = new Date(payload.recordedAt);
    const settings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId: payload.distributorId },
      select: { timezone: true },
    });
    const outcome = payload.outcome ?? (eventType === 'OrderDelivered' ? DeliveryOutcomeType.DELIVERED : DeliveryOutcomeType.UNABLE_TO_DELIVER);

    try {
      await this.prisma.deliveryFact.create({
        data: {
          eventId,
          distributorId: payload.distributorId,
          orderId: payload.orderId,
          traderCustomerId: payload.traderCustomerId,
          outcome,
          unableReason: outcome === DeliveryOutcomeType.UNABLE_TO_DELIVER ? (payload.unableReason ?? null) : null,
          dropMethod: payload.dropMethod ?? null,
          committedDate: dateOnly(payload.committedDate),
          requestedDate: dateOnly(payload.requestedDate),
          routeId: payload.routeId ?? null,
          runId: payload.runId ?? null,
          occurredAt,
          distributorLocalDate: distributorLocalDate(occurredAt, settings?.timezone ?? 'UTC'),
        },
      });
    } catch (err) {
      // Replayed event (at-least-once delivery): the fact is already recorded.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`Event ${eventId} already recorded as a delivery fact — skipping (idempotent replay)`);
        return;
      }
      throw err;
    }
  }
}
