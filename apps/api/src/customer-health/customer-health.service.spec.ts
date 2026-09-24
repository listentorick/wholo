import { Test, TestingModule } from '@nestjs/testing';
import { CustomerHealthService } from './customer-health.service';
import { PrismaService } from '../prisma/prisma.service';

// $queryRaw is a tagged template; Prisma invokes it as `strings, ...values`.
// getHealth fires thirteen $queryRaw calls inside one Promise.all, and three of
// them (the spend sums) share identical SQL text — a
// text-discriminating mock (as analytics.service.spec.ts uses) can't tell
// them apart. None of the thirteen calls has an `await` ahead of it in its
// private method, so Promise.all's array order is exactly the invocation
// order; sequential mockResolvedValueOnce, in that fixed order, is used
// instead. The order (must stay in sync with getHealth's Promise.all):
// roster, neverOrdered, missedOrder, spendCurrent, spendComparison,
// delivery, mistakes, range, earliestDataDate, activeCustomers,
// placedWeeks, baselineOrderCount, sales90.
function mockQueries(
  prisma: { $queryRaw: jest.Mock },
  over: Partial<{
    roster: unknown[];
    neverOrdered: unknown[];
    missedOrder: unknown[];
    spendCurrent: unknown[];
    spendComparison: unknown[];
    delivery: unknown[];
    mistakes: unknown[];
    range: unknown[];
    earliestDataDate: unknown[];
    activeCustomers: unknown[];
    placedWeeks: unknown[];
    baselineOrderCount: unknown[];
    sales90: unknown[];
  }> = {},
) {
  const order: Array<keyof typeof over> = [
    'roster', 'neverOrdered', 'missedOrder', 'spendCurrent', 'spendComparison',
    'delivery', 'mistakes', 'range', 'earliestDataDate', 'activeCustomers', 'placedWeeks', 'baselineOrderCount', 'sales90',
  ];
  const defaults: Record<string, unknown[]> = {
    roster: [], neverOrdered: [], missedOrder: [], spendCurrent: [], spendComparison: [],
    delivery: [], mistakes: [], range: [], earliestDataDate: [{ earliest: new Date('2026-01-01T00:00:00.000Z') }],
    activeCustomers: [{ count: 0 }], placedWeeks: [], baselineOrderCount: [{ count: 0 }], sales90: [],
  };
  const mock = jest.fn();
  for (const key of order) {
    mock.mockResolvedValueOnce(over[key] ?? defaults[key]);
  }
  prisma.$queryRaw = mock;
}

describe('CustomerHealthService', () => {
  let service: CustomerHealthService;
  let prisma: { distributorSettings: { findUnique: jest.Mock }; $queryRaw: jest.Mock };
  const now = new Date('2026-09-24T12:00:00.000Z');

  beforeEach(async () => {
    prisma = {
      distributorSettings: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerHealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CustomerHealthService);
  });

  it('returns an empty, healthy result for a distributor with no active customers', async () => {
    mockQueries(prisma);

    const result = await service.getHealth('dist-1', now);

    expect(result.distributorId).toBe('dist-1');
    expect(result.timezone).toBe('UTC');
    expect(result.tiles).toEqual({ activeCustomers90d: 0, atRiskCount: 0, salesLast30d: 0 });
    expect(result.tierCounts).toEqual({ healthy: 0, watch: 0, at_risk: 0 });
    expect(result.needingAttention).toEqual([]);
  });

  it('flags a never-ordered customer at-risk on its own, keeps a healthy customer out of needingAttention, and never lets rejected/cancelled orders alone move a customer off healthy', async () => {
    mockQueries(prisma, {
      roster: [
        { organisationId: 'org-1', customerName: 'Never Orders Ltd', activeSince: new Date('2026-01-01T00:00:00.000Z') },
        { organisationId: 'org-2', customerName: 'Steady Co', activeSince: new Date('2026-01-01T00:00:00.000Z') },
        { organisationId: 'org-3', customerName: 'Our Fault Only Ltd', activeSince: new Date('2026-01-01T00:00:00.000Z') },
      ],
      neverOrdered: [{ organisationId: 'org-1' }],
      spendCurrent: [
        { traderCustomerId: 'org-2', value: 500 },
        { traderCustomerId: 'org-3', value: 200 },
      ],
      spendComparison: [
        { traderCustomerId: 'org-2', value: 500 },
        { traderCustomerId: 'org-3', value: 200 },
      ],
      mistakes: [{ traderCustomerId: 'org-3', rejectedOrCancelledCount: 2 }],
      activeCustomers: [{ count: 2 }],
    });

    const result = await service.getHealth('dist-1', now);

    expect(result.tierCounts).toEqual({ healthy: 2, watch: 0, at_risk: 1 });
    expect(result.tiles).toEqual({ activeCustomers90d: 2, atRiskCount: 1, salesLast30d: 700 });

    expect(result.needingAttention).toHaveLength(1);
    expect(result.needingAttention[0]).toMatchObject({
      customerId: 'org-1', // the organisation id — what /customers/:id addresses
      customerName: 'Never Orders Ltd',
      tier: 'at_risk',
      reasons: [{ code: 'NEVER_ORDERED', category: 'no_relationship_yet', severity: 'at_risk' }],
    });
  });

  it('zero-fills the 8-week buying-trends window and applies one baseline-derived expected value to every week', async () => {
    mockQueries(prisma, {
      placedWeeks: [{ weekStart: new Date('2026-09-14T00:00:00.000Z'), placedOrders: 12 }],
      baselineOrderCount: [{ count: 40 }],
    });

    const result = await service.getHealth('dist-1', now);

    expect(result.buyingTrends).toHaveLength(8);
    expect(result.buyingTrends.every((w) => w.expectedOrders === 5)).toBe(true); // 40 / 8 weeks
    expect(result.buyingTrends[0]).toEqual({ weekStart: '2026-07-27', expectedOrders: 5, placedOrders: 0 });
    expect(result.buyingTrends[7]).toEqual({ weekStart: '2026-09-14', expectedOrders: 5, placedOrders: 12 });
  });

  it('covers only complete weeks: on a Thursday the part-finished current week (from 21 Sep) is not in the trend', async () => {
    mockQueries(prisma);

    const result = await service.getHealth('dist-1', now); // Thursday 24 Sep 2026

    expect(result.buyingTrends.map((w) => w.weekStart)).not.toContain('2026-09-21');
    expect(result.buyingTrends.at(-1)?.weekStart).toBe('2026-09-14');
  });

  it('expects orders only when the baseline window is fully covered by history (baseline starts 1 Jun)', async () => {
    mockQueries(prisma, { earliestDataDate: [{ earliest: new Date('2026-06-01T00:00:00.000Z') }], baselineOrderCount: [{ count: 40 }] });
    const covered = await service.getHealth('dist-1', now);
    expect(covered.buyingTrends.every((w) => w.expectedOrders === 5)).toBe(true);

    mockQueries(prisma, { earliestDataDate: [{ earliest: new Date('2026-06-02T00:00:00.000Z') }], baselineOrderCount: [{ count: 40 }] });
    const partial = await service.getHealth('dist-1', now);
    expect(partial.buyingTrends.every((w) => w.expectedOrders === null)).toBe(true);
  });

  it('has no expected orders — null, not 0 — when the distributor has no data yet in the baseline window', async () => {
    mockQueries(prisma, {
      earliestDataDate: [{ earliest: new Date('2026-08-31T00:00:00.000Z') }], // baseline window starts 2026-06-01
      placedWeeks: [{ weekStart: new Date('2026-09-14T00:00:00.000Z'), placedOrders: 12 }],
    });

    const result = await service.getHealth('dist-1', now);

    expect(result.buyingTrends.every((w) => w.expectedOrders === null)).toBe(true);
    expect(result.buyingTrends[7].placedOrders).toBe(12);
  });

  it('reports where sales come from: top customers with their tier, and everyone else as other', async () => {
    mockQueries(prisma, {
      roster: [
        { organisationId: 'org-1', customerName: 'Never Orders Ltd', activeSince: new Date('2026-01-01T00:00:00.000Z') },
        { organisationId: 'org-2', customerName: 'Steady Co', activeSince: new Date('2026-01-01T00:00:00.000Z') },
      ],
      neverOrdered: [{ organisationId: 'org-1' }],
      sales90: [
        { traderCustomerId: 'org-2', value: 600 },
        { traderCustomerId: 'org-inactive', value: 400 },
      ],
    });

    const { salesConcentration } = await service.getHealth('dist-1', now);

    expect(salesConcentration.periodDays).toBe(90);
    expect(salesConcentration.totalValue).toBe(1000);
    expect(salesConcentration.topCustomers).toEqual([{ customerId: 'org-2', customerName: 'Steady Co', tier: 'healthy', value: 600, share: 0.6 }]);
    expect(salesConcentration.otherValue).toBe(400);
  });

  it('counts every customer\'s 30-day sales in the tile — including one with no active relationship — so it agrees with the sales chart', async () => {
    mockQueries(prisma, {
      roster: [{ organisationId: 'org-2', customerName: 'Steady Co', activeSince: new Date('2026-01-01T00:00:00.000Z') }],
      spendCurrent: [
        { traderCustomerId: 'org-2', value: 600 },
        { traderCustomerId: 'org-inactive', value: 400 },
      ],
    });

    const { tiles } = await service.getHealth('dist-1', now);

    expect(tiles.salesLast30d).toBe(1000);
  });

  it('defaults to UTC when the distributor has no timezone configured', async () => {
    prisma.distributorSettings.findUnique.mockResolvedValue(null);
    mockQueries(prisma);

    const result = await service.getHealth('dist-1', now);

    expect(result.timezone).toBe('UTC');
  });
});
