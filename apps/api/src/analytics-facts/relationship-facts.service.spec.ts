import { RelationshipOrigin, TradeRelationshipStatus } from '@prisma/client';
import { relationshipEventEffect } from './relationship-facts.service';

const { ACTIVE, SUSPENDED, INACTIVE, PENDING_INVITE, PENDING_REQUEST } = TradeRelationshipStatus;

describe('relationshipEventEffect', () => {
  describe('opening', () => {
    it('a staff-created relationship opens as MANUAL', () => {
      expect(relationshipEventEffect('TradeRelationshipCreated', { origin: 'MANUAL', fromStatus: null, toStatus: PENDING_INVITE }).opensWith)
        .toBe(RelationshipOrigin.MANUAL);
    });

    it('a customer imported from the accounting system opens as ACCOUNTING_IMPORT', () => {
      expect(relationshipEventEffect('TradeRelationshipCreated', { origin: 'ACCOUNTING_IMPORT', fromStatus: null, toStatus: PENDING_INVITE }).opensWith)
        .toBe(RelationshipOrigin.ACCOUNTING_IMPORT);
    });

    it("a customer's first access request opens as ACCESS_REQUEST", () => {
      expect(relationshipEventEffect('TradeRelationshipAccessRequested', { fromStatus: null, toStatus: PENDING_REQUEST }).opensWith)
        .toBe(RelationshipOrigin.ACCESS_REQUEST);
    });

    it('a re-request after a decline does not reopen the relationship', () => {
      expect(relationshipEventEffect('TradeRelationshipAccessRequested', { fromStatus: INACTIVE, toStatus: PENDING_REQUEST }).opensWith)
        .toBeNull();
    });

    it.each(['CustomerInviteSent', 'CustomerInviteAccepted', 'TradeRelationshipSuspended', 'TradeRelationshipRemoved'])(
      '%s does not open a relationship',
      (eventType) => {
        expect(relationshipEventEffect(eventType, { fromStatus: PENDING_INVITE, toStatus: ACTIVE }).opensWith).toBeNull();
      },
    );
  });

  describe('activation', () => {
    it.each([
      ['CustomerInviteAccepted', PENDING_INVITE],
      ['TradeRelationshipActivated', PENDING_INVITE],
      ['TradeRelationshipRequestAccepted', PENDING_REQUEST],
    ])('%s from %s activates the customer', (eventType, fromStatus) => {
      expect(relationshipEventEffect(eventType, { fromStatus, toStatus: ACTIVE }).activates).toBe(true);
    });

    it('unsuspending is a return, not a new activation', () => {
      expect(relationshipEventEffect('TradeRelationshipUnsuspended', { fromStatus: SUSPENDED, toStatus: ACTIVE }).activates).toBe(false);
    });

    it('an extra user accepting an invite on an already-active relationship is not a new activation', () => {
      expect(relationshipEventEffect('CustomerInviteAccepted', { fromStatus: ACTIVE, toStatus: ACTIVE }).activates).toBe(false);
    });

    it('accepting an invite on a suspended relationship is not counted as becoming a customer', () => {
      expect(relationshipEventEffect('CustomerInviteAccepted', { fromStatus: SUSPENDED, toStatus: ACTIVE }).activates).toBe(false);
    });

    it.each([
      ['TradeRelationshipSuspended', ACTIVE, SUSPENDED],
      ['TradeRelationshipRequestDeclined', PENDING_REQUEST, INACTIVE],
      ['CustomerInviteSent', PENDING_INVITE, PENDING_INVITE],
    ])('%s does not activate', (eventType, fromStatus, toStatus) => {
      expect(relationshipEventEffect(eventType, { fromStatus, toStatus }).activates).toBe(false);
    });
  });

  it('only a removed event removes the relationship', () => {
    expect(relationshipEventEffect('TradeRelationshipRemoved', { fromStatus: ACTIVE, toStatus: ACTIVE }).removes).toBe(true);
    expect(relationshipEventEffect('TradeRelationshipSuspended', { fromStatus: ACTIVE, toStatus: SUSPENDED }).removes).toBe(false);
  });
});
