import { PrismaService } from '../prisma/prisma.service';
import { IngestionRunService, PROCESSING_STALE_MS, QUEUED_STALE_MS } from './ingestion-run.service';

function makePrisma() {
  return {
    ingestionRun: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

const baseInput = {
  distributorId: 'dist-1',
  sourceType: 'accounting',
  sourceRef: 'conn-1',
  resourceType: 'contact',
  trigger: 'MANUAL' as const,
};

describe('IngestionRunService', () => {
  let service: IngestionRunService;
  let prisma: ReturnType<typeof makePrisma>;
  const tx = { ingestionRun: {} as Record<string, jest.Mock> };

  beforeEach(() => {
    prisma = makePrisma();
    service = new IngestionRunService(prisma as unknown as PrismaService);
    tx.ingestionRun = {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'run-1', ...data })),
    };
  });

  describe('requestRun', () => {
    it('creates a QUEUED row when none exists — and says to enqueue it', async () => {
      tx.ingestionRun.createMany.mockResolvedValue({ count: 1 });
      tx.ingestionRun.findUniqueOrThrow.mockResolvedValue({ id: 'run-1', status: 'QUEUED' });

      const result = await service.requestRun(tx as never, baseInput);

      expect(result.shouldEnqueue).toBe(true);
      expect(tx.ingestionRun.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ sourceRef: 'conn-1', trigger: 'MANUAL' })],
        skipDuplicates: true, // ON CONFLICT DO NOTHING — a unique violation would abort the caller's tx
      });
    });

    it('resets a finished/stale row back to QUEUED with zeroed counts in ONE conditional update', async () => {
      tx.ingestionRun.findUniqueOrThrow.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', trigger: 'SCHEDULED' });
      tx.ingestionRun.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.requestRun(tx as never, baseInput);

      expect(result.shouldEnqueue).toBe(true);
      const { where, data } = tx.ingestionRun.updateMany.mock.calls[0][0];
      expect(where.id).toBe('run-1');
      // The status re-check lives in the WHERE, so a concurrent caller that
      // already moved the row to QUEUED makes this update match nothing.
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { status: { in: ['COMPLETED', 'FAILED'] } },
          { status: 'PROCESSING', updatedAt: { lt: expect.any(Date) } },
          { status: 'QUEUED', queuedAt: { lt: expect.any(Date) } },
        ]),
      );
      expect(data).toMatchObject({ status: 'QUEUED', recordsProcessed: 0, recordsTotal: null, errorMessage: null });
    });

    it('treats a PROCESSING row as stale only after PROCESSING_STALE_MS, and a QUEUED one after QUEUED_STALE_MS', async () => {
      tx.ingestionRun.findUniqueOrThrow.mockResolvedValue({ id: 'run-1', status: 'PROCESSING', trigger: 'SCHEDULED' });
      const before = Date.now();

      await service.requestRun(tx as never, baseInput);

      const or = tx.ingestionRun.updateMany.mock.calls[0][0].where.OR;
      const processingCutoff = or[1].updatedAt.lt.getTime();
      const queuedCutoff = or[2].queuedAt.lt.getTime();
      expect(before - processingCutoff).toBeGreaterThanOrEqual(PROCESSING_STALE_MS - 1000);
      expect(before - queuedCutoff).toBeGreaterThanOrEqual(QUEUED_STALE_MS - 1000);
    });

    it('does not enqueue again while a run is already queued or processing', async () => {
      const existing = { id: 'run-1', status: 'PROCESSING', trigger: 'MANUAL' };
      tx.ingestionRun.findUniqueOrThrow.mockResolvedValue(existing);

      const result = await service.requestRun(tx as never, baseInput);

      expect(result).toEqual({ run: existing, shouldEnqueue: false });
      expect(tx.ingestionRun.update).not.toHaveBeenCalled();
    });

    it('escalates a running SCHEDULED run to MANUAL on a manual click, without enqueueing a duplicate', async () => {
      tx.ingestionRun.findUniqueOrThrow.mockResolvedValue({ id: 'run-1', status: 'PROCESSING', trigger: 'SCHEDULED' });

      const result = await service.requestRun(tx as never, baseInput);

      expect(result.shouldEnqueue).toBe(false);
      expect(tx.ingestionRun.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { trigger: 'MANUAL' } });
    });
  });

  describe('claim', () => {
    it('transitions a QUEUED row to PROCESSING and returns it', async () => {
      prisma.ingestionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.ingestionRun.findUnique.mockResolvedValue({ id: 'run-1', status: 'PROCESSING' });
      const run = await service.claim('run-1');
      expect(run).toEqual({ id: 'run-1', status: 'PROCESSING' });
      const where = prisma.ingestionRun.updateMany.mock.calls[0][0].where;
      expect(where.id).toBe('run-1');
    });

    it('returns null when no row was claimable (already running or done)', async () => {
      prisma.ingestionRun.updateMany.mockResolvedValue({ count: 0 });
      const run = await service.claim('run-1');
      expect(run).toBeNull();
      expect(prisma.ingestionRun.findUnique).not.toHaveBeenCalled();
    });

    it('only two concurrent claims — exactly one wins', async () => {
      let remaining = 1;
      prisma.ingestionRun.updateMany.mockImplementation(() => {
        const count = remaining;
        remaining = 0;
        return Promise.resolve({ count });
      });
      prisma.ingestionRun.findUnique.mockResolvedValue({ id: 'run-1' });
      const [a, b] = await Promise.all([service.claim('run-1'), service.claim('run-1')]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
    });

    it('allows reclaiming a stale PROCESSING row', async () => {
      prisma.ingestionRun.updateMany.mockResolvedValue({ count: 1 });
      prisma.ingestionRun.findUnique.mockResolvedValue({ id: 'run-1' });
      await service.claim('run-1');
      const or = prisma.ingestionRun.updateMany.mock.calls[0][0].where.OR;
      const staleClause = or.find((c: Record<string, unknown>) => c.status === 'PROCESSING');
      const cutoff: Date = staleClause.updatedAt.lt;
      expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(PROCESSING_STALE_MS - 1000);
    });
  });

  describe('finalize', () => {
    it('finalizeSuccess sets COMPLETED + finishedAt + counts', async () => {
      await service.finalizeSuccess('run-1', { recordsProcessed: 10, detailCount: 2 });
      expect(prisma.ingestionRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'COMPLETED', recordsProcessed: 10, detailCount: 2 }),
      });
      expect(prisma.ingestionRun.update.mock.calls[0][0].data.finishedAt).toBeInstanceOf(Date);
    });

    it('finalizeSuccess records when the run last succeeded, separately from its current status', async () => {
      await service.finalizeSuccess('run-1', { recordsProcessed: 10 });
      const { data } = prisma.ingestionRun.update.mock.calls[0][0];
      expect(data.lastSucceededAt).toBeInstanceOf(Date);
      expect(data.lastSucceededAt).toEqual(data.finishedAt);
    });

    it('a failed or re-queued attempt keeps the last success (ADR-061)', async () => {
      await service.finalizeFailure('run-1', 'Xero getContacts failed with HTTP 403');
      for (const call of prisma.ingestionRun.update.mock.calls) {
        expect(call[0].data).not.toHaveProperty('lastSucceededAt');
      }
    });

    it('persists the new/updated/removed delta breakdown', async () => {
      await service.finalizeSuccess('run-1', {
        recordsProcessed: 10,
        recordsCreated: 4,
        recordsUpdated: 3,
        recordsRemoved: 1,
      });
      expect(prisma.ingestionRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({ recordsCreated: 4, recordsUpdated: 3, recordsRemoved: 1 }),
      });
    });

    it('finalizeFailure truncates the message and never throws', async () => {
      prisma.ingestionRun.update.mockRejectedValue(new Error('db gone'));
      await expect(service.finalizeFailure('run-1', 'x'.repeat(5000))).resolves.toBeUndefined();
    });
  });

  describe('incremental position + schedule', () => {
    it('stores the next cursor and stamps lastFullRunAt after a full pull', async () => {
      await service.finalizeSuccess('run-1', { recordsProcessed: 3 }, { cursor: 'c-2', full: true });

      const { data } = prisma.ingestionRun.update.mock.calls[0][0];
      expect(data.cursor).toBe('c-2');
      expect(data.lastFullRunAt).toBeInstanceOf(Date);
    });

    it('leaves lastFullRunAt alone after an incremental pull, and the cursor alone when none is given', async () => {
      await service.finalizeSuccess('run-1', { recordsProcessed: 3 }, { full: false });

      const { data } = prisma.ingestionRun.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('lastFullRunAt');
      expect(data).not.toHaveProperty('cursor');
    });

    it('gives unscheduled rows their first slot without touching already-scheduled ones', async () => {
      prisma.ingestionRun.updateMany.mockResolvedValue({ count: 1 });
      const slot = new Date('2026-09-29T10:17:00Z');

      const filled = await service.fillMissingSchedules([
        { sourceType: 'accounting', sourceRef: 'conn-1', resourceType: 'contact', nextRunAt: slot },
      ]);

      expect(filled).toBe(1);
      expect(prisma.ingestionRun.updateMany).toHaveBeenCalledWith({
        where: { sourceType: 'accounting', sourceRef: 'conn-1', resourceType: 'contact', nextRunAt: null },
        data: { nextRunAt: slot },
      });
    });
  });
});
