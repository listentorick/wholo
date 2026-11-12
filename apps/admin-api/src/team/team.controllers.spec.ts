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
    const service = { overview: jest.fn(), removeMember: jest.fn(), supportGrants: jest.fn(), endSupportGrant: jest.fn() } as unknown as TeamService;
    const controller = new TeamController(service);
    const req = { user: { organisationId: 'dist-own', token: 'tok' } } as never;

    controller.overview(req);
    controller.removeMember(req, 'user-1');
    controller.supportGrants(req, 'true');
    controller.supportGrants(req);
    controller.endSupportGrant(req, 'g-1');

    expect(service.overview).toHaveBeenCalledWith('dist-own', 'tok');
    expect(service.removeMember).toHaveBeenCalledWith('dist-own', 'user-1', 'tok');
    expect(service.supportGrants).toHaveBeenNthCalledWith(1, 'dist-own', true, 'tok');
    expect(service.supportGrants).toHaveBeenNthCalledWith(2, 'dist-own', false, 'tok');
    expect(service.endSupportGrant).toHaveBeenCalledWith('dist-own', 'g-1', 'tok');
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

    expect(service.acceptInvitation).toHaveBeenCalledWith('emailed', 'kc-token', undefined);
  });

  it('passes a code on accept, looks up without a guard, and sends codes for a signed-in identity', async () => {
    const service = {
      acceptInvitation: jest.fn().mockResolvedValue({}),
      lookupInvitation: jest.fn().mockResolvedValue({ invitedEmail: 'sam@vine.test' }),
      sendInvitationCode: jest.fn().mockResolvedValue({ sentTo: 'sam@vine.test', expiresInMinutes: 10 }),
    } as unknown as TeamService;
    const controller = new InvitationsController(service);

    await controller.accept({ user: { token: 'kc-token' } } as never, { token: 'emailed', code: '123456' });
    expect(service.acceptInvitation).toHaveBeenCalledWith('emailed', 'kc-token', '123456');
    await expect(controller.lookup({ token: 'emailed' })).resolves.toEqual({ invitedEmail: 'sam@vine.test' });
    await controller.sendCode({ user: { token: 'kc-token' } } as never, { token: 'emailed' });
    expect(service.sendInvitationCode).toHaveBeenCalledWith('emailed', 'kc-token');

    expect(Reflect.getMetadata('__guards__', InvitationsController.prototype.lookup)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', InvitationsController.prototype.sendCode)).toEqual([KeycloakJwtAuthGuard]);
  });
});
