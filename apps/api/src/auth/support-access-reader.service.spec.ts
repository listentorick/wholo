import { OrganisationType, Role } from '@prisma/client';
import { SupportAccessReader } from './support-access-reader.service';

type Row = {
  id: string;
  userId: string;
  distributorId: string;
  role: Role;
  startsAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  distributor: { type: OrganisationType; deletedAt: Date | null };
};

// A stand-in for the grants table that applies the query's filter, so these
// tests read which grants come back rather than how the query is spelt. The
// real query against Postgres is covered by support-grants.integration-spec.
function fakePrisma(rows: Row[]) {
  return {
    supportAccessGrant: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        rows
          .filter(
            (r) =>
              r.userId === where.userId &&
              r.revokedAt === where.revokedAt &&
              r.startsAt <= where.startsAt.lte &&
              r.expiresAt > where.expiresAt.gt &&
              r.distributor.type === where.distributor.type &&
              r.distributor.deletedAt === where.distributor.deletedAt,
          )
          .map(({ id, distributorId, role, expiresAt }) => ({ id, distributorId, role, expiresAt })),
      ),
    },
  };
}

const now = new Date('2026-10-23T12:00:00Z');
const hours = (h: number) => new Date(now.getTime() + h * 3600_000);
const grant = (id: string, overrides: Partial<Row> = {}): Row => ({
  id,
  userId: 'op-1',
  distributorId: `dist-${id}`,
  role: Role.SUPPORT,
  startsAt: hours(-1),
  expiresAt: hours(3),
  revokedAt: null,
  distributor: { type: OrganisationType.DISTRIBUTOR, deletedAt: null },
  ...overrides,
});

describe('SupportAccessReader.findActiveForUser', () => {
  it('returns only the caller’s grants that are open right now', async () => {
    const reader = new SupportAccessReader(
      fakePrisma([
        grant('open'),
        grant('other-user', { userId: 'op-2' }),
        grant('expired', { expiresAt: hours(-0.5) }),
        grant('ends-now', { expiresAt: now }),
        grant('not-started', { startsAt: hours(1) }),
        grant('revoked', { revokedAt: hours(-0.5) }),
        grant('deleted-wholesaler', { distributor: { type: OrganisationType.DISTRIBUTOR, deletedAt: hours(-24) } }),
        grant('not-a-wholesaler', { distributor: { type: OrganisationType.TRADE_CUSTOMER, deletedAt: null } }),
      ]) as never,
    );

    await expect(reader.findActiveForUser('op-1', now)).resolves.toEqual([
      { id: 'open', distributorId: 'dist-open', role: Role.SUPPORT, expiresAt: hours(3) },
    ]);
  });

  it('returns nothing for a user without grants', async () => {
    const reader = new SupportAccessReader(fakePrisma([grant('open')]) as never);
    await expect(reader.findActiveForUser('someone-else', now)).resolves.toEqual([]);
  });
});
