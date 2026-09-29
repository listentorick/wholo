import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AccountingSyncScheduler, firstSlot } from './accounting-sync.scheduler';
import { AccountingSyncService } from './sync/accounting-sync.service';

const MIN = 60_000;
const NOW = new Date('2026-09-29T10:00:00Z');

describe('firstSlot', () => {
  it('syncs a connection made within the last interval straight away', () => {
    expect(firstSlot(NOW, new Date(NOW.getTime() - 5 * MIN), 30 * MIN)).toEqual(NOW);
  });

  it('spreads older connections across one interval', () => {
    const slot = firstSlot(NOW, new Date('2026-01-01'), 30 * MIN, () => 0.5);
    expect(slot).toEqual(new Date(NOW.getTime() + 15 * MIN));
  });

  it('spreads a large fleet evenly: roughly N / 30 slots per minute', () => {
    let seed = 42;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const perMinute = new Array(30).fill(0);
    for (let i = 0; i < 1000; i++) {
      const slot = firstSlot(NOW, new Date('2026-01-01'), 30 * MIN, random);
      perMinute[Math.floor((slot.getTime() - NOW.getTime()) / MIN)] += 1;
    }
    // 1000 / 30 ≈ 33 per minute; allow generous random variation.
    expect(Math.max(...perMinute)).toBeLessThan(60);
    expect(Math.min(...perMinute)).toBeGreaterThan(12);
  });
});

describe('AccountingSyncScheduler.runOnce', () => {
  let scheduler: AccountingSyncScheduler;
  let connections: Array<{ id: string; distributorId: string; connectedAt: Date }>;
  let scheduled: Array<{ id?: string; sourceRef: string; resourceType: string; nextRunAt: Date | null }>;
  let enqueueDue: jest.Mock;
  let fillMissingSchedules: jest.Mock;
  let skipDue: jest.Mock;
  let unsettledConnectionIds: string[];

  beforeEach(() => {
    connections = [{ id: 'conn-1', distributorId: 'dist-1', connectedAt: new Date('2026-01-01') }];
    scheduled = [];
    enqueueDue = jest.fn().mockResolvedValue({ enqueued: true, nextRunAt: NOW });
    skipDue = jest.fn().mockResolvedValue(NOW);
    fillMissingSchedules = jest.fn().mockImplementation(async (rows: unknown[]) => rows.length);
    unsettledConnectionIds = ['conn-1'];
    const prisma = {
      accountingConnection: { findMany: jest.fn(async () => connections) },
      accountingInvoiceExport: {
        groupBy: jest.fn(async () => unsettledConnectionIds.map((id) => ({ accountingConnectionId: id }))),
      },
    };
    const ingestionRuns = { listScheduled: jest.fn(async () => scheduled), fillMissingSchedules };
    scheduler = new AccountingSyncScheduler(
      prisma as unknown as PrismaService,
      ingestionRuns as unknown as IngestionRunService,
      { enqueueDue, skipDue } as unknown as AccountingSyncService,
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('treats a never-run (connection, resource type) as due now', async () => {
    const summary = await scheduler.runOnce(NOW);

    expect(summary.due).toBe(4);
    expect(enqueueDue).toHaveBeenCalledWith('dist-1', 'conn-1', 'contact', null, NOW);
    expect(enqueueDue).toHaveBeenCalledWith('dist-1', 'conn-1', 'invoice', null, NOW);
  });

  it('enqueues every row whose slot has passed — no per-tick cap — and leaves future ones alone', async () => {
    connections = Array.from({ length: 200 }, (_, i) => ({
      id: `conn-${i}`,
      distributorId: `dist-${i}`,
      connectedAt: new Date('2026-01-01'),
    }));
    scheduled = connections.flatMap((c) => [
      { sourceRef: c.id, resourceType: 'contact', nextRunAt: new Date(NOW.getTime() - MIN) },
      { sourceRef: c.id, resourceType: 'product', nextRunAt: new Date(NOW.getTime() + 10 * MIN) },
      { sourceRef: c.id, resourceType: 'tax_type', nextRunAt: new Date(NOW.getTime() + 60 * MIN) },
      { sourceRef: c.id, resourceType: 'invoice', nextRunAt: new Date(NOW.getTime() + 5 * MIN) },
    ]);

    const summary = await scheduler.runOnce(NOW);

    expect(summary.due).toBe(200);
    expect(enqueueDue).toHaveBeenCalledTimes(200);
    expect(enqueueDue.mock.calls.every((c) => c[2] === 'contact')).toBe(true);
  });

  it('gives rows that predate scheduling a first slot instead of enqueueing them all at once', async () => {
    scheduled = [
      { sourceRef: 'conn-1', resourceType: 'contact', nextRunAt: null },
      { sourceRef: 'conn-1', resourceType: 'product', nextRunAt: null },
      { sourceRef: 'conn-1', resourceType: 'tax_type', nextRunAt: null },
      { sourceRef: 'conn-1', resourceType: 'invoice', nextRunAt: null },
    ];

    const summary = await scheduler.runOnce(NOW);

    expect(summary.seeded).toBe(4);
    expect(enqueueDue).not.toHaveBeenCalled();
  });

  it('counts runs already in flight separately from queued ones', async () => {
    enqueueDue.mockResolvedValueOnce({ enqueued: false, nextRunAt: NOW });

    const summary = await scheduler.runOnce(NOW);

    expect(summary).toMatchObject({ due: 4, enqueued: 3, skippedInFlight: 1 });
  });

  it('keeps going when one row fails, and logs it with its ids', async () => {
    enqueueDue.mockRejectedValueOnce(new Error('db blip'));

    const summary = await scheduler.runOnce(NOW);

    expect(summary).toMatchObject({ due: 4, enqueued: 3, failed: 1 });
    const errorSpy = Logger.prototype.error as unknown as jest.Mock;
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: 'accounting.scheduler.enqueue_failed',
      connectionId: 'conn-1',
      resourceType: 'contact',
    });
  });

  it('logs one summary line per tick', async () => {
    await scheduler.runOnce(NOW);

    const logSpy = Logger.prototype.log as unknown as jest.Mock;
    const tick = logSpy.mock.calls.find(([f]) => (f as { event?: string }).event === 'accounting.scheduler.tick');
    expect(tick?.[0]).toMatchObject({ connections: 1, due: 4, enqueued: 4, durationMs: expect.any(Number) });
  });

  it('makes no provider call for the invoice sync when a connection has nothing unsettled — just moves the slot on', async () => {
    unsettledConnectionIds = [];
    const slot = new Date(NOW.getTime() - MIN);
    scheduled = [
      { id: 'run-inv', sourceRef: 'conn-1', resourceType: 'invoice', nextRunAt: slot },
      { id: 'run-c', sourceRef: 'conn-1', resourceType: 'contact', nextRunAt: new Date(NOW.getTime() + MIN) },
      { id: 'run-p', sourceRef: 'conn-1', resourceType: 'product', nextRunAt: new Date(NOW.getTime() + MIN) },
      { id: 'run-t', sourceRef: 'conn-1', resourceType: 'tax_type', nextRunAt: new Date(NOW.getTime() + MIN) },
    ] as typeof scheduled;

    const summary = await scheduler.runOnce(NOW);

    expect(summary).toMatchObject({ due: 1, enqueued: 0, skippedNothingToDo: 1 });
    expect(enqueueDue).not.toHaveBeenCalled();
    expect(skipDue).toHaveBeenCalledWith('run-inv', 'invoice', slot, NOW);
  });
});
