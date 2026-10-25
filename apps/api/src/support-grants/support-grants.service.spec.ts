import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrganisationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../auth/ops-session';
import { SupportGrantsService, clampDurationMinutes } from './support-grants.service';

const NOW = new Date('2026-10-23T12:00:00Z');

const operator: RequestUser = {
  sub: 'op-1',
  opsSession: true,
  memberships: [{ organisationId: 'stocdup', organisationType: OrganisationType.PLATFORM, roles: [Role.PLATFORM_ADMIN] }],
};
const owner: RequestUser = {
  sub: 'owner-1',
  memberships: [{ organisationId: 'dist-1', organisationType: OrganisationType.DISTRIBUTOR, roles: [Role.DISTRIBUTOR_ADMIN] }],
};
const warehouse: RequestUser = {
  sub: 'staff-1',
  memberships: [{ organisationId: 'dist-1', organisationType: OrganisationType.DISTRIBUTOR, roles: [Role.WAREHOUSE_STAFF] }],
};

function grantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grant-1',
    userId: 'op-1',
    distributorId: 'dist-1',
    role: Role.SUPPORT,
    reason: 'Price lists, ticket 142',
    startsAt: NOW,
    expiresAt: new Date(NOW.getTime() + 4 * 3600_000),
    revokedAt: null,
    revokedByUserId: null,
    endedBy: null,
    distributor: { name: 'Vine & Co', slug: 'vineandco' },
    user: { firstName: 'Rick', lastName: 'Walsh' },
    ...overrides,
  };
}

describe('clampDurationMinutes', () => {
  it.each([
    [undefined, 240],
    [60, 60],
    [5, 15],
    [10_000, 480],
  ])('%s → %s', (requested, expected) => {
    expect(clampDurationMinutes(requested)).toBe(expected);
  });
});

describe('SupportGrantsService', () => {
  let service: SupportGrantsService;
  let tx: {
    supportAccessGrant: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  const audited: { action: string }[] = [];

  const prisma = {
    organisation: { findFirst: jest.fn() },
    membership: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
    supportAccessGrant: { findFirst: jest.fn(), findMany: jest.fn() },
    auditLog: { count: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    audited.length = 0;
    tx = { supportAccessGrant: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() } };
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn({ ...tx, supportAccessGrant: { ...tx.supportAccessGrant } }));
    prisma.user.findUniqueOrThrow.mockResolvedValue({ firstName: 'Rick', lastName: 'Walsh' });
    prisma.organisation.findFirst.mockResolvedValue({ id: 'dist-1' });
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.membership.findMany.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        SupportGrantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: (_tx: unknown, params: { action: string }) => audited.push(params) } },
      ],
    }).compile();
    service = module.get(SupportGrantsService);
  });

  describe('create', () => {
    const dto = { userId: 'op-1', reason: '  Price lists, ticket 142  ', durationMinutes: 240 };

    it('opens a new grant for the caller and records it', async () => {
      tx.supportAccessGrant.findFirst.mockResolvedValue(null);
      tx.supportAccessGrant.create.mockImplementation(async ({ data }) => grantRow({ reason: data.reason, expiresAt: data.expiresAt }));

      const result = await service.create(operator, 'dist-1', dto, NOW);

      expect(result).toMatchObject({
        distributorName: 'Vine & Co',
        holder: { id: 'op-1', name: 'Rick Walsh' },
        reason: 'Price lists, ticket 142',
        expiresAt: '2026-10-23T16:00:00.000Z',
        status: 'ACTIVE',
      });
      expect(audited.map((a) => a.action)).toEqual(['SUPPORT_ACCESS_STARTED']);
    });

    it('extends the open grant instead of adding a second one', async () => {
      const open = grantRow({ reason: 'Price lists, ticket 142', expiresAt: new Date(NOW.getTime() + 3600_000) });
      tx.supportAccessGrant.findFirst.mockResolvedValue(open);
      tx.supportAccessGrant.update.mockImplementation(async ({ data }) => ({ ...open, ...data }));

      const result = await service.create(operator, 'dist-1', { ...dto, reason: 'Invoices, ticket 150', durationMinutes: 120 }, NOW);

      expect(result).toMatchObject({ expiresAt: '2026-10-23T14:00:00.000Z', reason: 'Price lists, ticket 142' });
      expect(audited).toEqual([expect.objectContaining({ action: 'SUPPORT_ACCESS_EXTENDED', summary: expect.stringContaining('Invoices, ticket 150') })]);
    });

    it('caps the visit at eight hours', async () => {
      tx.supportAccessGrant.findFirst.mockResolvedValue(null);
      tx.supportAccessGrant.create.mockImplementation(async ({ data }) => grantRow({ expiresAt: data.expiresAt }));

      const result = await service.create(operator, 'dist-1', { ...dto, durationMinutes: 24 * 60 }, NOW);

      expect(result.expiresAt).toBe('2026-10-23T20:00:00.000Z');
    });

    it('refuses to open access for someone else', async () => {
      await expect(service.create(operator, 'dist-1', { ...dto, userId: 'someone-else' }, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a reason', async () => {
      await expect(service.create(operator, 'dist-1', { ...dto, reason: '   ' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an unknown or non-distributor organisation', async () => {
      prisma.organisation.findFirst.mockResolvedValue(null);
      await expect(service.create(operator, 'nope', dto, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a distributor the caller already belongs to', async () => {
      prisma.membership.findUnique.mockResolvedValue({ id: 'm-1' });
      await expect(service.create(operator, 'dist-1', dto, NOW)).rejects.toBeInstanceOf(ConflictException);
    });

    describe('when two opens overlap', () => {
      const serializationFailure = () =>
        new Prisma.PrismaClientKnownRequestError('could not serialize access', { code: 'P2034', clientVersion: 'test' });

      it('tries again, and the retry extends the grant the other one made', async () => {
        let attempts = 0;
        const other = grantRow({ expiresAt: new Date(NOW.getTime() + 4 * 3600_000) });
        prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
          attempts += 1;
          if (attempts === 1) throw serializationFailure();
          return fn(tx);
        });
        tx.supportAccessGrant.findFirst.mockResolvedValue(other);
        tx.supportAccessGrant.update.mockImplementation(async ({ data }) => grantRow({ expiresAt: data.expiresAt }));

        const result = await service.create(operator, 'dist-1', dto, NOW);

        expect(result.status).toBe('ACTIVE');
        expect(audited.map((a) => a.action)).toEqual(['SUPPORT_ACCESS_EXTENDED']);
      });

      it('gives up with a conflict, not a server error, if it keeps clashing', async () => {
        prisma.$transaction.mockRejectedValue(serializationFailure());
        await expect(service.create(operator, 'dist-1', dto, NOW)).rejects.toBeInstanceOf(ConflictException);
      });

      it('does not retry other failures', async () => {
        prisma.$transaction.mockRejectedValue(new Error('connection lost'));
        await expect(service.create(operator, 'dist-1', dto, NOW)).rejects.toThrow('connection lost');
      });
    });
  });

  describe('listForUser', () => {
    it('refuses to list another user’s grants', async () => {
      await expect(service.listForUser(operator, 'op-2', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('puts active grants first and says how ended ones ended, as recorded when they ended', async () => {
      // The Owner who ended 'old' has since left the team: it still reads DISTRIBUTOR.
      prisma.supportAccessGrant.findMany.mockResolvedValue([
        grantRow({ id: 'old', startsAt: new Date('2026-10-20T10:00:00Z'), expiresAt: new Date('2026-10-20T14:00:00Z'), revokedAt: new Date('2026-10-20T11:00:00Z'), revokedByUserId: 'owner-1', endedBy: 'DISTRIBUTOR' }),
        grantRow({ id: 'expired', startsAt: new Date('2026-10-21T10:00:00Z'), expiresAt: new Date('2026-10-21T14:00:00Z') }),
        grantRow({ id: 'now' }),
      ]);

      const result = await service.listForUser(operator, 'op-1', new Date(NOW.getTime() + 60_000));

      expect(result.map((g) => [g.id, g.status, g.endedBy])).toEqual([
        ['now', 'ACTIVE', null],
        ['old', 'ENDED', 'DISTRIBUTOR'],
        ['expired', 'EXPIRED', null],
      ]);
    });
  });

  describe('listForDistributor', () => {
    it('lets any member see the grants in effect now', async () => {
      prisma.supportAccessGrant.findMany.mockResolvedValue([grantRow()]);
      const result = await service.listForDistributor(warehouse, 'dist-1', true, NOW);
      expect(result).toHaveLength(1);
    });

    it('keeps the full history to team managers, with change counts', async () => {
      prisma.supportAccessGrant.findMany.mockResolvedValue([grantRow()]);
      prisma.auditLog.count.mockResolvedValue(3);

      await expect(service.listForDistributor(warehouse, 'dist-1', false, NOW)).rejects.toBeInstanceOf(ForbiddenException);
      const result = await service.listForDistributor(owner, 'dist-1', false, NOW);
      expect(result[0].changeCount).toBe(3);
    });

    it('refuses a support visitor (a grant is not a membership)', async () => {
      const visitor: RequestUser = { ...operator, memberships: [...operator.memberships!, { organisationId: 'dist-1', roles: [Role.SUPPORT], supportGrantId: 'grant-1' }] };
      await expect(service.listForDistributor(visitor, 'dist-1', true, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('revoke', () => {
    beforeEach(() => {
      // The stored row: the conditional end applies only while it is open.
      let stored = grantRow();
      prisma.supportAccessGrant.findFirst.mockImplementation(async () => stored);
      tx.supportAccessGrant.updateMany.mockImplementation(async ({ data }) => {
        if (stored.revokedAt) return { count: 0 };
        stored = { ...stored, ...data };
        return { count: 1 };
      });
      tx.supportAccessGrant.findUniqueOrThrow.mockImplementation(async () => stored);
      endedMeanwhile = (by) => {
        stored = { ...stored, ...by } as typeof stored;
      };
    });
    let endedMeanwhile: (by: Record<string, unknown>) => void;

    it('ends it once when two people end it at the same moment', async () => {
      // Both read the grant as open; the Owner's end lands first.
      prisma.supportAccessGrant.findFirst.mockResolvedValueOnce(grantRow());
      endedMeanwhile({ revokedAt: NOW, revokedByUserId: 'owner-1', endedBy: 'DISTRIBUTOR' });

      const result = await service.revoke(operator, 'dist-1', 'grant-1', NOW);

      expect(result).toMatchObject({ status: 'ENDED', endedBy: 'DISTRIBUTOR' });
      expect(audited).toHaveLength(0);
    });

    it('lets the holder leave', async () => {
      const result = await service.revoke(operator, 'dist-1', 'grant-1', NOW);
      expect(result).toMatchObject({ status: 'ENDED', endedBy: 'HOLDER' });
      expect(audited.map((a) => a.action)).toEqual(['SUPPORT_ACCESS_ENDED']);
    });

    it('lets the distributor’s Owner end it', async () => {
      const result = await service.revoke(owner, 'dist-1', 'grant-1', NOW);
      expect(result).toMatchObject({ status: 'ENDED', endedBy: 'DISTRIBUTOR' });
    });

    it('records a platform admin ending someone else’s visit as Stocdup', async () => {
      const otherOperator: RequestUser = { ...operator, sub: 'op-2' };
      const result = await service.revoke(otherOperator, 'dist-1', 'grant-1', NOW);
      expect(result).toMatchObject({ status: 'ENDED', endedBy: 'STOCDUP' });
    });

    it('reads a visit ended before the side was recorded from the row itself', async () => {
      prisma.supportAccessGrant.findFirst.mockResolvedValue(grantRow({ revokedAt: NOW, revokedByUserId: 'op-1' }));
      await expect(service.revoke(owner, 'dist-1', 'grant-1', NOW)).resolves.toMatchObject({ endedBy: 'HOLDER' });
      prisma.supportAccessGrant.findFirst.mockResolvedValue(grantRow({ revokedAt: NOW, revokedByUserId: 'owner-1' }));
      await expect(service.revoke(owner, 'dist-1', 'grant-1', NOW)).resolves.toMatchObject({ endedBy: 'STOCDUP' });
    });

    it('refuses staff without team management', async () => {
      await expect(service.revoke(warehouse, 'dist-1', 'grant-1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses the holder outside an ops session', async () => {
      await expect(service.revoke({ ...operator, opsSession: false }, 'dist-1', 'grant-1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('is a no-op on a grant that has already ended', async () => {
      prisma.supportAccessGrant.findFirst.mockResolvedValue(grantRow({ revokedAt: NOW, revokedByUserId: 'op-1' }));
      const result = await service.revoke(owner, 'dist-1', 'grant-1', NOW);
      expect(result.status).toBe('ENDED');
      expect(audited).toHaveLength(0);
    });

    it('404s for a grant on another distributor', async () => {
      prisma.supportAccessGrant.findFirst.mockResolvedValue(null);
      await expect(service.revoke(owner, 'dist-1', 'grant-x', NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
