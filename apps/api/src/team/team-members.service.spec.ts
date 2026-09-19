import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvitationStatus, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMembersService } from './team-members.service';

const owner = { id: 'user-owner', firstName: 'Priya', lastName: 'Shah', email: 'priya@vine.test' };
const tom = { id: 'user-tom', firstName: 'Tom', lastName: 'Reid', email: 'tom@vine.test' };

const membership = (user: typeof tom, role: Role, extraRoles: Role[] = [], createdAt = new Date('2026-06-02T09:00:00Z')) => ({
  id: `m-${user.id}`,
  userId: user.id,
  organisationId: 'dist-1',
  role,
  roles: [role, ...extraRoles].map((r) => ({ role: r })),
  createdAt,
  user,
});

describe('TeamMembersService', () => {
  let service: TeamMembersService;
  const prisma: any = {
    membership: { findMany: jest.fn(), findFirst: jest.fn() },
    staffInvitation: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const outbox = { writeEvent: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    jest.clearAllMocks();
    // A transaction whose writes are reflected in what it returns, so the
    // resulting member view shows what would actually be persisted.
    prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn({
        membershipRole: { deleteMany: jest.fn() },
        membership: {
          update: jest.fn(async ({ data }) => ({
            ...membership(tom, data.role),
            role: data.role,
            roles: data.roles.create,
          })),
        },
      }),
    );
    prisma.user.findUnique.mockResolvedValue(owner);

    const module = await Test.createTestingModule({
      providers: [
        TeamMembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();
    service = module.get(TeamMembersService);
  });

  describe('list', () => {
    it('lists members with their roles and who invited them', async () => {
      prisma.membership.findMany.mockResolvedValue([
        membership(owner, Role.DISTRIBUTOR_ADMIN, [], new Date('2025-03-12T09:00:00Z')),
        membership(tom, Role.OPERATIONS_MANAGER, [Role.WAREHOUSE_STAFF]),
      ]);
      prisma.staffInvitation.findMany.mockResolvedValue([
        { status: InvitationStatus.ACCEPTED, acceptedByUserId: tom.id, invitedBy: { firstName: 'Priya', lastName: 'Shah' } },
      ]);

      const result = await service.list('dist-1');

      expect(result).toEqual([
        expect.objectContaining({ userId: owner.id, roles: [Role.DISTRIBUTOR_ADMIN], invitedBy: null }),
        expect.objectContaining({
          userId: tom.id,
          email: 'tom@vine.test',
          roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF],
          invitedBy: 'Priya Shah',
        }),
      ]);
    });

    it('includes a role that only exists on the legacy scalar', async () => {
      prisma.membership.findMany.mockResolvedValue([
        { ...membership(tom, Role.WAREHOUSE_STAFF), roles: [] },
      ]);
      prisma.staffInvitation.findMany.mockResolvedValue([]);
      const [member] = await service.list('dist-1');
      expect(member.roles).toEqual([Role.WAREHOUSE_STAFF]);
    });
  });

  describe('updateRoles', () => {
    it('replaces the roles and keeps the legacy role consistent with them', async () => {
      prisma.membership.findFirst.mockResolvedValue(membership(tom, Role.OPERATIONS_MANAGER));

      const result = await service.updateRoles('dist-1', tom.id, owner.id, { roles: [Role.WAREHOUSE_STAFF] });

      // Effective roles = role rows + legacy scalar: neither may still carry the old role.
      expect(result.roles).toEqual([Role.WAREHOUSE_STAFF]);
    });

    it('refuses to change the caller’s own roles', async () => {
      await expect(
        service.updateRoles('dist-1', owner.id, owner.id, { roles: [Role.OPERATIONS_MANAGER] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to change an Owner’s roles', async () => {
      prisma.membership.findFirst.mockResolvedValue(membership(tom, Role.DISTRIBUTOR_ADMIN));
      await expect(
        service.updateRoles('dist-1', tom.id, owner.id, { roles: [Role.OPERATIONS_MANAGER] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to make someone an Owner or driver', async () => {
      await expect(
        service.updateRoles('dist-1', tom.id, owner.id, { roles: [Role.DISTRIBUTOR_ADMIN] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateRoles('dist-1', tom.id, owner.id, { roles: [Role.DRIVER] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires at least one role', async () => {
      await expect(service.updateRoles('dist-1', tom.id, owner.id, { roles: [] })).rejects.toThrow('Choose at least one role');
    });

    it('404s for someone who is not a member of this distributor', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      await expect(
        service.updateRoles('dist-1', 'stranger', owner.id, { roles: [Role.OPERATIONS_MANAGER] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    interface Effects {
      membershipsDeleted: string[];
      roleRowsDeleted: string[];
      usersSoftDeleted: string[];
      refreshTokensDeleted: string[];
      events: { eventType: string; payload: any }[];
      audits: any[];
    }
    let fx: Effects;
    let otherMemberships: number;

    beforeEach(() => {
      fx = { membershipsDeleted: [], roleRowsDeleted: [], usersSoftDeleted: [], refreshTokensDeleted: [], events: [], audits: [] };
      otherMemberships = 0;
      audit.record.mockImplementation(async (_tx: unknown, params: unknown) => void fx.audits.push(params));
      outbox.writeEvent.mockImplementation(async (_tx: unknown, _t: string, _id: string, eventType: string, payload: unknown) => {
        fx.events.push({ eventType, payload });
      });
      prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
        fn({
          membership: {
            count: jest.fn(async () => otherMemberships),
            delete: jest.fn(async ({ where }) => void fx.membershipsDeleted.push(where.id)),
          },
          membershipRole: { deleteMany: jest.fn(async ({ where }) => void fx.roleRowsDeleted.push(where.membershipId)) },
          user: { update: jest.fn(async ({ where }) => void fx.usersSoftDeleted.push(where.id)) },
          refreshToken: { deleteMany: jest.fn(async ({ where }) => void fx.refreshTokensDeleted.push(where.userId)) },
        }),
      );
    });

    const tomMembership = (over: Record<string, unknown> = {}) => ({
      ...membership({ ...tom, keycloakId: 'kc-tom' } as any, Role.OPERATIONS_MANAGER, [Role.WAREHOUSE_STAFF]),
      ...over,
    });

    it('takes away access, retains the person and their history, and queues the Keycloak disable', async () => {
      prisma.membership.findFirst.mockResolvedValue(tomMembership());

      await service.remove('dist-1', tom.id, owner.id);

      expect(fx.roleRowsDeleted).toEqual(['m-user-tom']);
      expect(fx.membershipsDeleted).toEqual(['m-user-tom']);
      expect(fx.usersSoftDeleted).toEqual([tom.id]); // soft delete: the row and its references remain
      expect(fx.refreshTokensDeleted).toEqual([tom.id]);
      expect(fx.events).toEqual([
        { eventType: 'StaffKeycloakDisableRequested', payload: { userId: tom.id, keycloakId: 'kc-tom', distributorId: 'dist-1' } },
      ]);
    });

    it('records who they were and who removed them, so the history reads properly afterwards', async () => {
      prisma.membership.findFirst.mockResolvedValue(tomMembership());

      await service.remove('dist-1', tom.id, owner.id);

      expect(fx.audits).toEqual([
        expect.objectContaining({
          action: 'REMOVED',
          actorUserId: owner.id,
          actorName: 'Priya Shah',
          summary: 'Removed Tom Reid from the team',
          changes: { userId: tom.id, email: 'tom@vine.test', name: 'Tom Reid', roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF] },
        }),
      ]);
    });

    it('only removes THIS membership for someone who belongs elsewhere too — no soft delete, no Keycloak disable', async () => {
      otherMemberships = 1;
      prisma.membership.findFirst.mockResolvedValue(tomMembership());

      await service.remove('dist-1', tom.id, owner.id);

      expect(fx.membershipsDeleted).toEqual(['m-user-tom']);
      expect(fx.usersSoftDeleted).toEqual([]);
      expect(fx.events).toEqual([]);
    });

    it('does not queue a Keycloak disable for someone who never signed in', async () => {
      prisma.membership.findFirst.mockResolvedValue(tomMembership({ user: { ...tom, keycloakId: null } }));
      await service.remove('dist-1', tom.id, owner.id);
      expect(fx.usersSoftDeleted).toEqual([tom.id]);
      expect(fx.events).toEqual([]);
    });

    it('refuses to remove the caller or an Owner', async () => {
      await expect(service.remove('dist-1', owner.id, owner.id)).rejects.toBeInstanceOf(ForbiddenException);
      prisma.membership.findFirst.mockResolvedValue(tomMembership({ role: Role.DISTRIBUTOR_ADMIN, roles: [{ role: Role.DISTRIBUTOR_ADMIN }] }));
      await expect(service.remove('dist-1', tom.id, owner.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fx.membershipsDeleted).toEqual([]);
    });

    it('404s for someone who is not on this distributor\u2019s team', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);
      await expect(service.remove('dist-1', 'stranger', owner.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
