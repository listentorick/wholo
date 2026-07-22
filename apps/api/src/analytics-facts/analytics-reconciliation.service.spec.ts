import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsReconciliationService } from './analytics-reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsReconciliationService', () => {
  let service: AnalyticsReconciliationService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsReconciliationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AnalyticsReconciliationService);
  });

  it('reports zero discrepancies when state matches live orders', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([{ count: 0 }]);

    const result = await service.reconcile();

    expect(result).toEqual({ missing: 0, mismatched: 0 });
  });

  it('reports orders missing from order_analytics_state', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 3 }]).mockResolvedValueOnce([{ count: 0 }]);

    const result = await service.reconcile();

    expect(result).toEqual({ missing: 3, mismatched: 0 });
  });

  it('reports orders whose recorded state has drifted from the live order', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([{ count: 2 }]);

    const result = await service.reconcile();

    expect(result).toEqual({ missing: 0, mismatched: 2 });
  });

  it('does not overlap ticks while a reconciliation run is in flight', async () => {
    // reconcile() makes two SEQUENTIAL $queryRaw calls (missing, then
    // mismatched) — return the same pending promise for every call so one
    // release() unblocks both, rather than recreating a promise per call
    // (which would leave the second call hanging forever).
    let release!: (value: Array<{ count: number }>) => void;
    const pending = new Promise<Array<{ count: number }>>((resolve) => {
      release = resolve;
    });
    prisma.$queryRaw.mockReturnValue(pending);

    const first = service.tick();
    const second = service.tick();
    release([{ count: 0 }]);
    await Promise.all([first, second]);

    // Two queries per reconcile() run (missing + mismatched); only one run
    // should have executed despite two overlapping ticks.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
