import type { TradeRelationshipStatus } from '@prisma/client';

// Trade-relationship lifecycle events (ADR-070). Every status change, plus
// creation and removal, is written to the outbox with these common fields so
// the relationship facts consumer can record the full history without looking
// anything up. Notification consumers read their own extra fields and ignore these.
export const RELATIONSHIP_EVENTS = {
  created: 'TradeRelationshipCreated',
  accessRequested: 'TradeRelationshipAccessRequested',
  inviteSent: 'CustomerInviteSent',
  inviteAccepted: 'CustomerInviteAccepted',
  requestAccepted: 'TradeRelationshipRequestAccepted',
  requestDeclined: 'TradeRelationshipRequestDeclined',
  activated: 'TradeRelationshipActivated',
  suspended: 'TradeRelationshipSuspended',
  unsuspended: 'TradeRelationshipUnsuspended',
  removed: 'TradeRelationshipRemoved',
} as const;

/** How a relationship was opened by the distributor: typed in by hand, or imported from their accounting system (their existing book of business). */
export type RelationshipCreatedOrigin = 'MANUAL' | 'ACCOUNTING_IMPORT';

export interface RelationshipEventFields {
  relationshipId: string;
  distributorId: string;
  customerId: string;
  /** Null when the event opens the relationship. */
  fromStatus: TradeRelationshipStatus | null;
  toStatus: TradeRelationshipStatus;
  occurredAt: string;
}

export function relationshipEventFields(
  rel: { id: string; distributorId: string; customerId: string },
  fromStatus: TradeRelationshipStatus | null,
  toStatus: TradeRelationshipStatus,
  occurredAt: Date = new Date(),
): RelationshipEventFields {
  return {
    relationshipId: rel.id,
    distributorId: rel.distributorId,
    customerId: rel.customerId,
    fromStatus,
    toStatus,
    occurredAt: occurredAt.toISOString(),
  };
}
