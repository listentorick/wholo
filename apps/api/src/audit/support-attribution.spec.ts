import { PrismaService } from '../prisma/prisma.service';
import { actedAsSupport, labelSupportActors } from './support-attribution';

const window = {
  userId: 'op-1',
  startsAt: new Date('2026-10-23T12:00:00Z'),
  expiresAt: new Date('2026-10-23T16:00:00Z'),
  revokedAt: null as Date | null,
};

describe('actedAsSupport', () => {
  it('is true inside the grant window', () => {
    expect(actedAsSupport([window], 'op-1', new Date('2026-10-23T13:00:00Z'))).toBe(true);
  });

  it('is false after the grant was revoked', () => {
    expect(actedAsSupport([{ ...window, revokedAt: new Date('2026-10-23T12:30:00Z') }], 'op-1', new Date('2026-10-23T13:00:00Z'))).toBe(false);
  });

  it('is false for other actors and system entries', () => {
    expect(actedAsSupport([window], 'someone', new Date('2026-10-23T13:00:00Z'))).toBe(false);
    expect(actedAsSupport([window], null, new Date('2026-10-23T13:00:00Z'))).toBe(false);
  });
});

describe('labelSupportActors', () => {
  it('suffixes the actor name of entries made during a support visit', async () => {
    const prisma = { supportAccessGrant: { findMany: jest.fn().mockResolvedValue([window]) } } as unknown as PrismaService;
    const entries = [
      { actorUserId: 'op-1', actorName: 'Rick Walsh', createdAt: new Date('2026-10-23T13:00:00Z') },
      { actorUserId: 'owner-1', actorName: 'Sam Patel', createdAt: new Date('2026-10-23T13:00:00Z') },
    ];

    const labelled = await labelSupportActors(prisma, 'dist-1', entries);

    expect(labelled.map((e) => [e.actorName, e.viaSupport])).toEqual([
      ['Rick Walsh (Stocdup support)', true],
      ['Sam Patel', false],
    ]);
  });
});
