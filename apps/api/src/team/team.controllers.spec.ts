import { Permission } from '@wholo/types';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { StaffInvitationAcceptController } from './staff-invitation-accept.controller';
import { InvitationLookupThrottlerGuard } from '../invitation-codes/invitation-lookup-throttler.guard';
import { StaffInvitationsController } from './staff-invitations.controller';
import { TeamMembersController } from './team-members.controller';

describe.each([
  ['StaffInvitationsController', StaffInvitationsController],
  ['TeamMembersController', TeamMembersController],
])('%s access control', (_name, controller) => {
  it('is guarded by auth, distributor scope and permissions', () => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', controller);
    expect(guards).toEqual([JwtAuthGuard, DistributorAccessGuard, PermissionsGuard]);
  });

  it('requires team management on every route', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller)).toEqual([Permission.TEAM_MANAGE]);
  });
});

describe('StaffInvitationAcceptController access control', () => {
  it('requires a verified Keycloak identity, and nothing else (the invitee has no membership yet)', () => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', StaffInvitationAcceptController.prototype.accept);
    expect(guards).toEqual([KeycloakIdentityGuard]);
  });

  it('sends a code only for a verified Keycloak identity', () => {
    expect(Reflect.getMetadata('__guards__', StaffInvitationAcceptController.prototype.sendCode)).toEqual([KeycloakIdentityGuard]);
  });

  it('looks an invitation up without sign-in, rate-limited per token', () => {
    expect(Reflect.getMetadata('__guards__', StaffInvitationAcceptController.prototype.lookup)).toEqual([InvitationLookupThrottlerGuard]);
  });
});
