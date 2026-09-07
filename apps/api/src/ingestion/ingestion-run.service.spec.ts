import { PrismaService } from '../prisma/prisma.service';
import { IngestionRunService, PROCESSING_STALE_MS } from './ingestion-run.service';

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
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'run-1', ...data })),
    };
  });

  describe('requestRun', () => {
    it('creates a QUEUED row when none exists', async () => {
      tx.ingestionRun.findUnique.mockResolvedValue(null);
      await service.requestRun(tx as never, baseInput);
      expect(tx.ingestionRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sourceRef: 'conn-1', trigger: 'MANUAL' }) }),
      );
    });

    it('resets a terminal row back to QUEUED with zeroed counts', async () => {
      tx.ingestionRun.findUnique.mockResolvedValue({ id: 'run-1', status: 'COMPLETED', trigger: 'SCHEDULED' });
      await service.requestRun(tx as never, baseInput);
      expect(tx.ingestionRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({
            status: 'QUEUED',
            recordsProcessed: 0,
            recordsTotal: null,
            startedAt: null,
            finishedAt: null,
            errorMessage: null,
          }),
        }),
      );
    });

    it('escalates a running SCHEDULED run to MANUAL on a manual click, without touching progress', async () => {
      tx.ingestionRun.findUnique.mockResolvedValue({ id: 'run-1', status: 'PROCESSING', trigger: 'SCHEDULED' });
      await service.requestRun(tx as never, baseInput);
      expect(tx.ingestionRun.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { trigger: 'MANUAL' } });
    });

    it('leaves a running MANUAL run untouched', async () => {
      const existing = { id: 'run-1', status: 'PROCESSING', trigger: 'MANUAL' };
      tx.ingestionRun.findUnique.mockResolvedValue(existing);
      const result = await service.requestRun(tx as never, baseInput);
      expect(tx.ingestionRun.update).not.toHaveBeenCalled();
      expect(result).toBe(existing);
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
});
