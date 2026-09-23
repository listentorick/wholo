import { DeliveryOverviewService } from './delivery-overview.service';
import { QUEUE_CAP } from './delivery-overview.logic';
import { PrismaService } from '../prisma/prisma.service';

// The bucket definitions (which orders land in which list) run in SQL and are
// proven against a real database in test/delivery-overview.integration-spec.ts;
// this covers the composition: the distributor-local day, and the snapshot shape.
function make(opts: { timezone?: string | null; counts?: Partial<Record<string, number>>; toAccept?: Array<{ submittedAt: Date }> } = {}) {
  const counts: Record<string, number | undefined> = { DELIVERY_FAILED: 0, SUBMITTED: 0, ...opts.counts };
  const order = {
    count: jest.fn(async ({ where }: any) => (where.status === 'ACCEPTED' ? (where.deliveryRunOrders ? counts.NOT_ON_RUN ?? 0 : counts.OVERDUE ?? 0) : counts[where.status] ?? 0)),
    findMany: jest.fn(async ({ where }: any) => (where.status === 'SUBMITTED' ? (opts.toAccept ?? []).map((o) => ({ id: 't', orderNumber: 'T', submittedAt: o.submittedAt, scheduledDeliveryDate: null, requestedDeliveryDate: null, customer: { name: 'C' }, deliveryOutcome: null, deliveryRunOrders: [] })) : [])),
  };
  const prisma = {
    distributorSettings: { findUnique: jest.fn().mockResolvedValue(opts.timezone === null ? null : { timezone: opts.timezone ?? 'Europe/London' }) },
    deliveryRun: { findMany: jest.fn().mockResolvedValue([]) },
    order,
  };
  return { service: new DeliveryOverviewService(prisma as unknown as PrismaService), prisma };
}

describe('DeliveryOverviewService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-18T23:30:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it("reports today in the distributor's timezone, not UTC", async () => {
    const { service } = make({ timezone: 'Europe/London' });
    const overview = await service.getOverview('dist-1');

    // 23:30Z on the 18th is already 00:30 on the 19th in London (BST).
    expect(overview).toMatchObject({ distributorId: 'dist-1', date: '2026-09-19', timezone: 'Europe/London' });
  });

  it('falls back to UTC for a distributor with no settings row', async () => {
    const { service } = make({ timezone: null });
    expect(await service.getOverview('dist-1')).toMatchObject({ date: '2026-09-18', timezone: 'UTC' });
  });

  it('returns the true bucket totals, the oldest waiting order, and the queue cap', async () => {
    const { service } = make({
      counts: { SUBMITTED: 4, DELIVERY_FAILED: 3, OVERDUE: 5, NOT_ON_RUN: 12 },
      toAccept: [{ submittedAt: new Date('2026-09-18T20:00:00.000Z') }, { submittedAt: new Date('2026-09-18T22:00:00.000Z') }],
    });

    const { counts, queueCap } = await service.getOverview('dist-1');

    expect(counts).toEqual({
      toAccept: { count: 4, oldestSubmittedAt: '2026-09-18T20:00:00.000Z' },
      overdue: { count: 5 },
      notOnRun: { count: 12 },
      failedLast24h: { count: 3 },
    });
    expect(queueCap).toBe(QUEUE_CAP);
  });

  it('is a clean, all-zero snapshot for a distributor with nothing going on', async () => {
    const { service } = make();
    expect(await service.getOverview('dist-1')).toMatchObject({
      counts: { toAccept: { count: 0, oldestSubmittedAt: null }, overdue: { count: 0 }, notOnRun: { count: 0 }, failedLast24h: { count: 0 } },
      progress: { planned: 0, delivered: 0, failed: 0, remaining: 0 },
      runs: [],
      queue: [],
    });
  });

  it('counts accepted orders no run has picked up as still to deliver today', async () => {
    const { service } = make({ counts: { NOT_ON_RUN: 3 } });
    expect((await service.getOverview('dist-1')).progress).toEqual({ planned: 3, delivered: 0, failed: 0, remaining: 3 });
  });
});
