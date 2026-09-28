import { Injectable, Logger } from '@nestjs/common';
import { Prisma, RelationshipOrigin, TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { RELATIONSHIP_EVENTS, RelationshipCreatedOrigin, RelationshipEventFields } from '../common/relationship-events';

export const RELATIONSHIP_EVENT_TYPES = new Set<string>(Object.values(RELATIONSHIP_EVENTS));

export type RelationshipEventPayload = Partial<RelationshipEventFields> & {
  origin?: RelationshipCreatedOrigin;
};

export interface RelationshipEventEffect {
  /** Set when this event opens the relationship: how it was opened. */
  opensWith: RelationshipOrigin | null;
  /** True when this event is the relationship becoming a customer, not returning to one. */
  activates: boolean;
  removes: boolean;
}

/**
 * What one lifecycle event means for the relationship's analytics state.
 * Pure so the definitions (ADR-070) are tested as plain behaviour.
 *
 * - Opening: a staff-created relationship, or a customer's FIRST access
 *   request. A re-request after a decline is not a new opening.
 * - Activation: a move into ACTIVE from anything but ACTIVE or SUSPENDED —
 *   so unsuspending, or an extra user accepting an invite on an
 *   already-active relationship, never counts as becoming a customer again.
 */
export function relationshipEventEffect(eventType: string, payload: RelationshipEventPayload): RelationshipEventEffect {
  let opensWith: RelationshipOrigin | null = null;
  if (eventType === RELATIONSHIP_EVENTS.created) {
    opensWith = payload.origin === 'ACCOUNTING_IMPORT' ? RelationshipOrigin.ACCOUNTING_IMPORT : RelationshipOrigin.MANUAL;
  } else if (eventType === RELATIONSHIP_EVENTS.accessRequested && payload.fromStatus == null) {
    opensWith = RelationshipOrigin.ACCESS_REQUEST;
  }

  const activates =
    payload.toStatus === TradeRelationshipStatus.ACTIVE &&
    payload.fromStatus !== TradeRelationshipStatus.ACTIVE &&
    payload.fromStatus !== TradeRelationshipStatus.SUSPENDED;

  return { opensWith, activates, removes: eventType === RELATIONSHIP_EVENTS.removed };
}

// Consumes the trade-relationship lifecycle events (ADR-070) into
// relationship_facts (append-only log) and relationship_analytics_state
// (one row per relationship). Idempotent on eventId, and safe against events
// arriving out of order: first-opened and first-activated only ever move
// earlier, and the current status only moves forward in business time.
@Injectable()
export class RelationshipFactsService {
  private readonly logger = new Logger(RelationshipFactsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleRelationshipEvent(eventId: string, eventType: string, payload: RelationshipEventPayload): Promise<void> {
    const { relationshipId, distributorId, customerId, fromStatus, toStatus, occurredAt: occurredAtIso } = payload;
    if (!relationshipId || !distributorId || !customerId || !toStatus || !occurredAtIso) {
      this.logger.warn(`Event ${eventId} (${eventType}) has no relationship lifecycle fields — skipping`);
      return;
    }
    const occurredAt = new Date(occurredAtIso);

    const settings = await this.prisma.distributorSettings.findUnique({
      where: { distributorId },
      select: { timezone: true },
    });
    const localDate = distributorLocalDate(occurredAt, settings?.timezone ?? 'UTC');
    const effect = relationshipEventEffect(eventType, payload);

    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.relationshipFact.create({
          data: {
            eventId,
            distributorId,
            relationshipId,
            customerId,
            eventType,
            fromStatus: fromStatus ?? null,
            toStatus,
            occurredAt,
            distributorLocalDate: localDate,
          },
        });
      } catch (err) {
        // Replayed event: the fact and its state change already committed together.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          this.logger.log(`Event ${eventId} already recorded as a relationship fact — skipping (idempotent replay)`);
          return;
        }
        throw err;
      }

      const openedAt = effect.opensWith ? occurredAt : null;
      const activatedAt = effect.activates ? occurredAt : null;
      const activatedVia = effect.activates ? eventType : null;
      const removedAt = effect.removes ? occurredAt : null;
      const origin = effect.opensWith ?? RelationshipOrigin.UNKNOWN;

      await tx.$executeRaw`
        INSERT INTO relationship_analytics_state
          ("relationshipId", "distributorId", "customerId", "origin", "openedAt", "activatedAt", "activatedVia", "status", "removedAt", "lastEventAt", "updatedAt")
        VALUES
          (${relationshipId}, ${distributorId}, ${customerId}, ${origin}::"RelationshipOrigin", ${openedAt}, ${activatedAt}, ${activatedVia},
           ${toStatus}::"TradeRelationshipStatus", ${removedAt}, ${occurredAt}, now())
        ON CONFLICT ("relationshipId") DO UPDATE SET
          "origin" = CASE
            WHEN EXCLUDED."openedAt" IS NOT NULL AND (relationship_analytics_state."openedAt" IS NULL OR EXCLUDED."openedAt" < relationship_analytics_state."openedAt")
            THEN EXCLUDED."origin" ELSE relationship_analytics_state."origin" END,
          "openedAt" = CASE
            WHEN EXCLUDED."openedAt" IS NOT NULL AND (relationship_analytics_state."openedAt" IS NULL OR EXCLUDED."openedAt" < relationship_analytics_state."openedAt")
            THEN EXCLUDED."openedAt" ELSE relationship_analytics_state."openedAt" END,
          "activatedVia" = CASE
            WHEN EXCLUDED."activatedAt" IS NOT NULL AND (relationship_analytics_state."activatedAt" IS NULL OR EXCLUDED."activatedAt" < relationship_analytics_state."activatedAt")
            THEN EXCLUDED."activatedVia" ELSE relationship_analytics_state."activatedVia" END,
          "activatedAt" = CASE
            WHEN EXCLUDED."activatedAt" IS NOT NULL AND (relationship_analytics_state."activatedAt" IS NULL OR EXCLUDED."activatedAt" < relationship_analytics_state."activatedAt")
            THEN EXCLUDED."activatedAt" ELSE relationship_analytics_state."activatedAt" END,
          "status" = CASE
            WHEN relationship_analytics_state."lastEventAt" < EXCLUDED."lastEventAt"
            THEN EXCLUDED."status" ELSE relationship_analytics_state."status" END,
          "removedAt" = COALESCE(relationship_analytics_state."removedAt", EXCLUDED."removedAt"),
          "lastEventAt" = GREATEST(relationship_analytics_state."lastEventAt", EXCLUDED."lastEventAt"),
          "updatedAt" = now()
      `;
    });
  }
}
