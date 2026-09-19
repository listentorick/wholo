import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KeycloakJwtAuthGuard } from '../auth/guards/keycloak-jwt-auth.guard';
import { InvitationsController } from './invitations.controller';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

describe('TeamController', () => {
  it('requires a signed-in distributor user for every route', () => {
    expect(Reflect.getMetadata('__guards__', TeamController)).toEqual([JwtAuthGuard]);
  });

  it('scopes every call to the caller’s own distributor, never one named by the client', () => {
    const service = { overview: jest.fn(), removeMember: jest.fn() } as unknown as TeamService;
    const controller = new TeamController(service);
    const req = { user: { organisationId: 'dist-own', token: 'tok' } } as never;

    controller.overview(req);
    controller.removeMember(req, 'user-1');

    expect(service.overview).toHaveBeenCalledWith('dist-own', 'tok');
    expect(service.removeMember).toHaveBeenCalledWith('dist-own', 'user-1', 'tok');
  });
});

describe('InvitationsController', () => {
  it('uses the signature-only guard, because the invitee has no membership yet', () => {
    const guards = Reflect.getMetadata('__guards__', InvitationsController.prototype.accept);
    expect(guards).toEqual([KeycloakJwtAuthGuard]);
  });

  it('accepts as the signed-in identity, forwarding their token', async () => {
    const service = { acceptInvitation: jest.fn().mockResolvedValue({ distributorName: 'Vine & Co' }) } as unknown as TeamService;
    const controller = new InvitationsController(service);

    await controller.accept({ user: { token: 'kc-token' } } as never, { token: 'emailed' });

    expect(service.acceptInvitation).toHaveBeenCalledWith('emailed', 'kc-token');
  });
});
