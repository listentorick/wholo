import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { ApiClientService } from '../api-client/api-client.service';
import { TeamService } from './team.service';

describe('TeamService', () => {
  let service: TeamService;
  const api = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [TeamService, { provide: ApiClientService, useValue: api }],
    }).compile();
    service = module.get(TeamService);
  });

  it('returns people and invitations together, so the page needs one call', async () => {
    const members = [{ userId: 'u1', roles: [Role.DISTRIBUTOR_ADMIN] }];
    const invitations = [{ id: 'i1', email: 'sam@vine.test', status: 'PENDING' }];
    api.get.mockImplementation(async (path: string) => (path.endsWith('/members') ? members : invitations));

    await expect(service.overview('dist-1', 'tok')).resolves.toEqual({ members, invitations });
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/members', 'tok');
    expect(api.get).toHaveBeenCalledWith('/distributors/dist-1/staff-invitations', 'tok');
  });

  it('fails the whole read if either half fails, rather than showing a partial team', async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/members')) throw new Error('boom');
      return [];
    });
    await expect(service.overview('dist-1', 'tok')).rejects.toThrow('boom');
  });

  it('relays every action to the distributor-scoped resource, with the caller’s token', async () => {
    const dto = { roles: [Role.WAREHOUSE_STAFF] };
    await service.invite('dist-1', { email: 'sam@vine.test', roles: [Role.OPERATIONS_MANAGER] }, 'tok');
    await service.updateInvitationRoles('dist-1', 'inv-1', dto, 'tok');
    await service.resendInvitation('dist-1', 'inv-1', 'tok');
    await service.revokeInvitation('dist-1', 'inv-1', 'tok');
    await service.updateMemberRoles('dist-1', 'user-1', dto, 'tok');
    await service.removeMember('dist-1', 'user-1', 'tok');

    expect(api.post).toHaveBeenCalledWith('/distributors/dist-1/staff-invitations', 'tok', { email: 'sam@vine.test', roles: [Role.OPERATIONS_MANAGER] });
    expect(api.patch).toHaveBeenCalledWith('/distributors/dist-1/staff-invitations/inv-1', 'tok', dto);
    expect(api.post).toHaveBeenCalledWith('/distributors/dist-1/staff-invitations/inv-1/resend', 'tok');
    expect(api.delete).toHaveBeenCalledWith('/distributors/dist-1/staff-invitations/inv-1', 'tok');
    expect(api.patch).toHaveBeenCalledWith('/distributors/dist-1/members/user-1', 'tok', dto);
    expect(api.delete).toHaveBeenCalledWith('/distributors/dist-1/members/user-1', 'tok');
  });

  it('accepts an invitation as the caller, with no distributor in the path (they have none yet)', async () => {
    api.post.mockResolvedValue({ distributorId: 'dist-1', distributorName: 'Vine & Co', roles: [Role.OPERATIONS_MANAGER] });

    await expect(service.acceptInvitation('emailed-token', 'bearer')).resolves.toMatchObject({ distributorName: 'Vine & Co' });
    expect(api.post).toHaveBeenCalledWith('/staff-invitations/accept', 'bearer', { token: 'emailed-token' });
  });
});
