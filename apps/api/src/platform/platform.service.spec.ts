import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformService } from './platform.service';

const NOW = new Date('2026-10-23T12:00:00Z');

describe('PlatformService', () => {
  let service: PlatformService;
  const prisma = {
    organisation: { findMany: jest.fn(), count: jest.fn() },
    orderFact: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    supportAccessGrant: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [PlatformService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PlatformService);
  });

  describe('listDistributors', () => {
    beforeEach(() => {
      prisma.organisation.findMany.mockResolvedValue([
        { id: 'd-new', name: 'Harbour Cellars', slug: 'harbour', createdAt: new Date('2026-10-20T00:00:00Z'), memberships: [{ user: { email: 'h@x.test' } }], _count: { products: 0, tradeRelationshipsAsDistributor: 0 } },
        { id: 'd-vine', name: 'Vine & Co', slug: 'vineandco', createdAt: new Date('2025-01-01T00:00:00Z'), memberships: [], _count: { products: 40, tradeRelationshipsAsDistributor: 12 } },
      ]);
      prisma.orderFact.groupBy
        .mockResolvedValueOnce([{ distributorId: 'd-vine', _count: { _all: 9 } }])
        .mockResolvedValueOnce([{ distributorId: 'd-vine', _max: { occurredAt: new Date('2026-10-22T09:00:00Z') } }]);
      prisma.supportAccessGrant.findMany.mockResolvedValue([{ id: 'g-1', distributorId: 'd-vine', expiresAt: new Date('2026-10-23T16:00:00Z'), reason: 'Price lists' }]);
    });

    it('returns activity, attention reasons and the caller’s open access per wholesaler', async () => {
      const rows = await service.listDistributors('op-1', {}, NOW);

      expect(rows).toEqual([
        expect.objectContaining({ id: 'd-new', ownerEmail: 'h@x.test', ordersLast30Days: 0, lastOrderAt: null, attention: ['NEW_WITHOUT_PRODUCTS'], myActiveGrant: null }),
        expect.objectContaining({
          id: 'd-vine',
          ownerEmail: null,
          activeCustomers: 12,
          ordersLast30Days: 9,
          lastOrderAt: '2026-10-22T09:00:00.000Z',
          attention: [],
          myActiveGrant: { id: 'g-1', expiresAt: '2026-10-23T16:00:00.000Z', reason: 'Price lists' },
        }),
      ]);
    });

    it('filters to wholesalers needing attention', async () => {
      const rows = await service.listDistributors('op-1', { filter: 'attention' }, NOW);
      expect(rows.map((r) => r.id)).toEqual(['d-new']);
    });

    it('filters to wholesalers the caller has open access to', async () => {
      const rows = await service.listDistributors('op-1', { filter: 'mine' }, NOW);
      expect(rows.map((r) => r.id)).toEqual(['d-vine']);
    });
  });

  it('builds platform stats with a 30-day zero-filled series', async () => {
    prisma.organisation.count.mockResolvedValueOnce(14).mockResolvedValueOnce(2);
    prisma.orderFact.findMany.mockResolvedValue([{ traderCustomerId: 'c1' }, { traderCustomerId: 'c2' }]);
    prisma.orderFact.count.mockResolvedValueOnce(120).mockResolvedValueOnce(100);
    prisma.orderFact.groupBy.mockResolvedValue([{ distributorLocalDate: new Date('2026-10-23T00:00:00Z'), _count: { _all: 7 } }]);
    prisma.supportAccessGrant.findMany.mockResolvedValue([{ distributorId: 'd-1' }, { distributorId: 'd-1' }, { distributorId: 'd-2' }]);

    const stats = await service.stats(NOW);

    expect(stats).toMatchObject({
      activeWholesalers: 14,
      wholesalersJoinedLast30Days: 2,
      activeTradeCustomers: 2,
      ordersLast30Days: 120,
      ordersPrevious30Days: 100,
      openSupportGrants: 3,
      wholesalersWithOpenSupport: 2,
    });
    expect(stats.ordersPerDay).toHaveLength(30);
    expect(stats.ordersPerDay[29]).toEqual({ date: '2026-10-23', orders: 7 });
  });
});
