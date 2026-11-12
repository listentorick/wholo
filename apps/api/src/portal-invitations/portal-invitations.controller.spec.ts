import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';
import { InvitationLookupThrottlerGuard } from '../invitation-codes/invitation-lookup-throttler.guard';
import { PortalInvitationsController } from './portal-invitations.controller';

describe('PortalInvitationsController access control', () => {
  const guards = (method: keyof PortalInvitationsController) =>
    Reflect.getMetadata('__guards__', PortalInvitationsController.prototype[method]);

  it('accepts and sends codes only for a verified Keycloak identity (the invitee has no membership yet)', () => {
    expect(guards('accept')).toEqual([KeycloakIdentityGuard]);
    expect(guards('sendCode')).toEqual([KeycloakIdentityGuard]);
  });

  it('looks an invitation up without sign-in, rate-limited per token', () => {
    expect(guards('lookup')).toEqual([InvitationLookupThrottlerGuard]);
  });
});
