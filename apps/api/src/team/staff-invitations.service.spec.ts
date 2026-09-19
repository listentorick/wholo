import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationStatus, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashInvitationToken, StaffInvitationsService } from './staff-invitations.service';

const DAY = 24 * 60 * 60 * 1000;

const inviter = { id: 'user-owner', firstName: 'Priya', lastName: 'Shah' };
const row = (overrides = {}) => ({
  id: 'inv-1',
  distributorId: 'dist-1',
  email: 'sam.patel@example.com',
  roles: [Role.OPERATIONS_MANAGER],
  tokenHash: 'hash',
  status: InvitationStatus.PENDING,
  expiresAt: new Date(Date.now() + 5 * DAY),
  createdAt: new Date('2026-09-16T10:00:00Z'),
  invitedByUserId: inviter.id,
  invitedBy: inviter,
  ...overrides,
});

describe('StaffInvitationsService', () => {
  let service: StaffInvitationsService;
  let events: { eventType: string; payload: Record<string, unknown> }[];
  let created: Record<string, unknown>[];
  let tx: any;
  const prisma: any = {
    organisation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    staffInvitation: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const outbox = {
    writeEvent: jest.fn(async (_tx, _type, _id, eventType, payload) => {
      events.push({ eventType, payload });
    }),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue('http://admin.test') };

  beforeEach(async () => {
    jest.clearAllMocks();
    events = [];
    created = [];
    tx = {
      staffInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(async ({ data }) => {
          created.push(data);
          return row({ ...data, id: 'inv-new', invitedBy: inviter });
        }),
        update: jest.fn(async ({ data }) => row({ ...data })),
      },
    };
    prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    prisma.organisation.findFirst.mockResolvedValue({ id: 'dist-1', name: 'Vine & Co', email: 'hi@vine.test', phone: null });
    prisma.user.findUnique.mockResolvedValue(inviter);
    prisma.user.findFirst.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        StaffInvitationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(StaffInvitationsService);
  });

  describe('create', () => {
    it('creates a pending invitation and queues the invitation email', async () => {
      const result = await service.create('dist-1', inviter.id, {
        email: '  Sam.Patel@Example.com ',
        roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF],
      });

      expect(result).toMatchObject({
        email: 'sam.patel@example.com',
        roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF],
        status: 'PENDING',
        invitedBy: { id: inviter.id, name: 'Priya Shah' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('StaffInviteSent');
      expect(events[0].payload).toMatchObject({ email: 'sam.patel@example.com', inviterName: 'Priya Shah', distributorName: 'Vine & Co' });
    });

    it('only ever stores a hash of the token; the raw token lives only in the emailed link', async () => {
      await service.create('dist-1', inviter.id, { email: 'sam@example.com', roles: [Role.OPERATIONS_MANAGER] });

      const inviteUrl = events[0].payload.inviteUrl as string;
      const token = new URL(inviteUrl).searchParams.get('token') as string;
      expect(inviteUrl.startsWith('http://admin.test/accept-invite?token=')).toBe(true);
      expect(token).toHaveLength(64);
      expect(created[0].tokenHash).toBe(hashInvitationToken(token));
      expect(JSON.stringify(created[0])).not.toContain(token);
    });

    it('expires in 7 days', async () => {
      const result = await service.create('dist-1', inviter.id, { email: 'sam@example.com', roles: [Role.WAREHOUSE_STAFF] });
      const days = (new Date(result.expiresAt).getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThanOrEqual(7);
    });

    it.each([
      ['the Owner role', [Role.DISTRIBUTOR_ADMIN]],
      ['the platform admin role', [Role.PLATFORM_ADMIN]],
      ['the driver role', [Role.DRIVER]],
      ['a trade customer role', [Role.TRADE_CUSTOMER]],
      ['an assignable role mixed with the Owner role', [Role.OPERATIONS_MANAGER, Role.DISTRIBUTOR_ADMIN]],
    ])('refuses %s', async (_label, roles) => {
      await expect(service.create('dist-1', inviter.id, { email: 'sam@example.com', roles })).rejects.toBeInstanceOf(BadRequestException);
      expect(events).toHaveLength(0);
    });

    it('requires at least one role', async () => {
      await expect(service.create('dist-1', inviter.id, { email: 'sam@example.com', roles: [] })).rejects.toThrow('Choose at least one role');
    });

    it('rejects an email that already has a Stocdup account', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'someone' });
      await expect(
        service.create('dist-1', inviter.id, { email: 'tom@example.com', roles: [Role.OPERATIONS_MANAGER] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events).toHaveLength(0);
    });

    it('404s when the distributor does not exist', async () => {
      prisma.organisation.findFirst.mockResolvedValue(null);
      await expect(
        service.create('nope', inviter.id, { email: 'sam@example.com', roles: [Role.OPERATIONS_MANAGER] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('reports an invitation past its expiry as EXPIRED', async () => {
      prisma.staffInvitation.findMany.mockResolvedValue([
        row({ id: 'a' }),
        row({ id: 'b', expiresAt: new Date(Date.now() - DAY) }),
      ]);
      const result = await service.list('dist-1');
      expect(result.map((r) => [r.id, r.status])).toEqual([
        ['a', 'PENDING'],
        ['b', 'EXPIRED'],
      ]);
    });
  });

  describe('resend', () => {
    it('issues a fresh invitation to the same address and roles', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row({ roles: [Role.WAREHOUSE_STAFF] }));
      const result = await service.resend('dist-1', 'inv-1', inviter.id);

      expect(result).toMatchObject({ id: 'inv-new', email: 'sam.patel@example.com', roles: [Role.WAREHOUSE_STAFF], status: 'PENDING' });
      expect(events.map((e) => e.eventType)).toEqual(['StaffInviteSent']);
    });

    it('can resend an invitation that has already expired', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row({ expiresAt: new Date(Date.now() - DAY) }));
      const result = await service.resend('dist-1', 'inv-1', inviter.id);
      expect(result.status).toBe('PENDING');
    });

    it('404s for an unknown, accepted or revoked invitation', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(null);
      await expect(service.resend('dist-1', 'gone', inviter.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to resend once the address has become a Stocdup account', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row());
      prisma.user.findFirst.mockResolvedValue({ id: 'registered' });
      await expect(service.resend('dist-1', 'inv-1', inviter.id)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateRoles', () => {
    it('changes the roles on a pending invitation', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row());
      const result = await service.updateRoles('dist-1', 'inv-1', inviter.id, { roles: [Role.WAREHOUSE_STAFF] });
      expect(result.roles).toEqual([Role.WAREHOUSE_STAFF]);
    });

    it('refuses an unassignable role', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row());
      await expect(
        service.updateRoles('dist-1', 'inv-1', inviter.id, { roles: [Role.DISTRIBUTOR_ADMIN] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('asks for a resend when the invitation has expired', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row({ expiresAt: new Date(Date.now() - DAY) }));
      await expect(
        service.updateRoles('dist-1', 'inv-1', inviter.id, { roles: [Role.WAREHOUSE_STAFF] }),
      ).rejects.toThrow('Resend it');
    });

    it('404s for an invitation in another distributor or no longer pending', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(null);
      await expect(
        service.updateRoles('dist-1', 'inv-x', inviter.id, { roles: [Role.WAREHOUSE_STAFF] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('revoke', () => {
    it('revokes a pending invitation', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row());
      await expect(service.revoke('dist-1', 'inv-1', inviter.id)).resolves.toBeUndefined();
    });

    it('can revoke an expired invitation', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(row({ expiresAt: new Date(Date.now() - DAY) }));
      await expect(service.revoke('dist-1', 'inv-1', inviter.id)).resolves.toBeUndefined();
    });

    it('404s when there is nothing pending to revoke', async () => {
      prisma.staffInvitation.findFirst.mockResolvedValue(null);
      await expect(service.revoke('dist-1', 'inv-1', inviter.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
