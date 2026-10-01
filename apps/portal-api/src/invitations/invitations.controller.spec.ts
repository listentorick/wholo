import { GUARDS_METADATA } from '@nestjs/common/constants';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KeycloakJwtAuthGuard } from '../auth/guards/keycloak-jwt-auth.guard';

describe('InvitationsController (portal-api)', () => {
  it('lets an identity with no Stocdup user accept an invitation (token-only guard, never JwtAuthGuard)', () => {
    // Accepting the invitation is what creates the user, so the guard that
    // requires an existing user must never be on this route. It was, from
    // a8673cf until this fix: every new customer's acceptance returned 401.
    const guards = Reflect.getMetadata(GUARDS_METADATA, InvitationsController.prototype.accept);

    expect(guards).toEqual([KeycloakJwtAuthGuard]);
    expect(guards).not.toContain(JwtAuthGuard);
  });

  it('passes the invite token and the caller\'s bearer token to apps/api', async () => {
    const accept = jest.fn().mockResolvedValue({ distributorSlug: 'vine-and-co' });
    const controller = new InvitationsController({ accept } as unknown as InvitationsService);

    const result = await controller.accept({ token: 'invite-token' }, { user: { token: 'bearer-token' } } as never);

    expect(accept).toHaveBeenCalledWith('invite-token', 'bearer-token');
    expect(result).toEqual({ distributorSlug: 'vine-and-co' });
  });
});
