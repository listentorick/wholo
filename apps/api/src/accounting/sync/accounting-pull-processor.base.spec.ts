import { Logger } from '@nestjs/common';
import { AccountingConnection } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionRunService } from '../../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting-connection.service';
import { AccountingAdapterRegistry } from '../adapters/accounting-adapter.registry';
import { AccountingConnectionAdapter } from '../adapters/accounting-connection-adapter.interface';
import { AccountingProviderError } from '../adapters/accounting-provider.error';
import { AccountingPullProcessorBase, PullContext, PullResult, RunProgress } from './accounting-pull-processor.base';

// The run lifecycle every accounting pull shares, tested once against the
// smallest possible pull. Subclass specs test only their own behaviour.
class TestPull extends AccountingPullProcessorBase {
  protected readonly logger = new Logger('TestPull');
  protected readonly recordNoun = 'widget';
  protected readonly resourceType = 'widget';
  preflightError: Error | null = null;
  pulled: PullContext[] = [];
  pullImpl: (ctx: PullContext) => Promise<PullResult> = async () => ({
    counts: { recordsProcessed: 2 },
    nextCursor: 'cursor-next',
    summary: { fields: { fetched: 2 }, message: 'Widget sync complete' },
  });

  protected async preflight(_c: AccountingConnection, _a: AccountingConnectionAdapter): Promise<void> {
    if (this.preflightError) throw this.preflightError;
  }

  protected async pull(ctx: PullContext): Promise<PullResult> {
    this.pulled.push(ctx);
    return this.pullImpl(ctx);
  }
}

function makeJob(payload: Record<string, unknown> = { runId: 'run-7' }, over: Record<string, unknown> = {}): Job {
  return {
    id: 'job-1',
    name: 'WidgetSyncRequested',
    data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: 'conn-1', payload },
    ...over,
  } as unknown as Job;
}

describe('AccountingPullProcessorBase', () => {
  const connection = {
    id: 'conn-1',
    distributorId: 'dist-1',
    provider: 'XERO',
    status: 'CONNECTED',
    accountingOrganisationId: 'acc-org-1',
    organisation: { id: 'acc-org-1', externalOrganisationId: 'org-1', name: 'Acme Wines', invoiceExportTargetStatus: 'DRAFT' },
    scopes: 'openid',
  };
  let pull: TestPull;
  let prisma: { accountingConnection: { findUnique: jest.Mock; update: jest.Mock } };
  let tokens: { getValidTokenSet: jest.Mock };
  let runs: Record<string, jest.Mock>;
  const adapter = { displayName: 'Test' };

  beforeEach(() => {
    prisma = { accountingConnection: { findUnique: jest.fn().mockResolvedValue(connection), update: jest.fn() } };
    tokens = { getValidTokenSet: jest.fn().mockResolvedValue({ accessToken: 't' }) };
    runs = {
      ensureRun: jest.fn().mockResolvedValue('run-1'),
      claim: jest.fn().mockResolvedValue({ id: 'run-7', trigger: 'SCHEDULED', cursor: 'cursor-stored', lastFullRunAt: new Date() }),
      setTotal: jest.fn(),
      heartbeat: jest.fn(),
      finalizeSuccess: jest.fn(),
      finalizeFailure: jest.fn(),
      requeueForRetry: jest.fn(),
    };
    pull = new TestPull(
      prisma as unknown as PrismaService,
      tokens as unknown as AccountingConnectionService,
      { get: jest.fn().mockReturnValue(adapter), displayName: () => 'Test' } as unknown as AccountingAdapterRegistry,
      runs as unknown as IngestionRunService,
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('connection checks', () => {
    it('finalises the run and calls nothing when the connection no longer exists', async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue(null);
      await pull.process(makeJob());
      expect(runs.finalizeFailure).toHaveBeenCalledWith('run-7', 'Accounting connection no longer exists');
      expect(pull.pulled).toHaveLength(0);
    });

    it('finalises the run and calls nothing when the connection is not CONNECTED', async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({ ...connection, status: 'ERROR' });
      await pull.process(makeJob());
      expect(runs.finalizeFailure).toHaveBeenCalledWith('run-7', 'Accounting connection is not connected');
      expect(tokens.getValidTokenSet).not.toHaveBeenCalled();
    });
  });

  describe('run lifecycle', () => {
    it('claims, pulls with the adapter and a valid token, stamps lastSyncedAt, and finalises with the new cursor', async () => {
      await pull.process(makeJob());

      expect(runs.claim).toHaveBeenCalledWith('run-7');
      expect(tokens.getValidTokenSet).toHaveBeenCalledWith('dist-1', 'XERO');
      expect(pull.pulled[0]).toMatchObject({ adapter, tokenSet: { accessToken: 't' }, cursor: 'cursor-stored', full: false });
      expect(pull.pulled[0].progress).toBeInstanceOf(RunProgress);
      expect(prisma.accountingConnection.update).toHaveBeenCalledWith({ where: { id: 'conn-1' }, data: { lastSyncedAt: expect.any(Date) } });
      expect(runs.finalizeSuccess).toHaveBeenCalledWith('run-7', { recordsProcessed: 2 }, { cursor: 'cursor-next', full: false });
    });

    it('does nothing when the run cannot be claimed (another attempt holds it, or it is done)', async () => {
      runs.claim.mockResolvedValue(null);
      await pull.process(makeJob());
      expect(pull.pulled).toHaveLength(0);
    });

    it('recreates the run row for a legacy job with no runId', async () => {
      await pull.process(makeJob({}));
      expect(runs.ensureRun).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'accounting', sourceRef: 'conn-1', resourceType: 'widget' }),
      );
      expect(runs.claim).toHaveBeenCalledWith('run-1');
    });
  });

  describe('full vs incremental', () => {
    const claimed = (over: Record<string, unknown>) =>
      runs.claim.mockResolvedValue({ id: 'run-7', trigger: 'SCHEDULED', cursor: 'cursor-stored', lastFullRunAt: new Date(), ...over });

    it('pulls in full (null cursor) with no cursor yet, on a manual Sync, and once the last full pull is a day old', async () => {
      for (const over of [{ cursor: null }, { trigger: 'MANUAL' }, { lastFullRunAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }]) {
        claimed(over);
        await pull.process(makeJob());
        expect(pull.pulled.at(-1)).toMatchObject({ cursor: null, full: true });
      }
      expect(runs.finalizeSuccess).toHaveBeenLastCalledWith('run-7', expect.any(Object), { cursor: 'cursor-next', full: true });
    });

    it('pulls incrementally from the stored cursor on a scheduled run', async () => {
      claimed({});
      await pull.process(makeJob());
      expect(pull.pulled[0]).toMatchObject({ cursor: 'cursor-stored', full: false });
    });
  });

  describe('failure policy', () => {
    const job = (attemptsMade: number, attempts = 3) => makeJob({ runId: 'run-7' }, { attemptsMade, opts: { attempts } });

    it('fails permanently, without calling the provider, when preflight rejects', async () => {
      pull.preflightError = new AccountingProviderError('Reconnect to grant access', false, undefined, 'SCOPE_MISSING');

      const err = await pull.process(job(0)).catch((e) => e);

      expect(err).toBeInstanceOf(UnrecoverableError);
      expect(tokens.getValidTokenSet).not.toHaveBeenCalled();
      expect(pull.pulled).toHaveLength(0);
      expect(runs.finalizeFailure).toHaveBeenCalledWith('run-7', 'Reconnect to grant access');
    });

    it('stops retrying a permanent provider error and logs it with its ids', async () => {
      pull.pullImpl = () => Promise.reject(new AccountingProviderError('HTTP 403', false, undefined, 'HTTP_403', { statusCode: 403 }));

      const err = await pull.process(job(0)).catch((e) => e);

      expect(err).toBeInstanceOf(UnrecoverableError);
      expect(runs.finalizeFailure).toHaveBeenCalledWith('run-7', 'HTTP 403');
      const warn = (Logger.prototype.warn as jest.Mock).mock.calls.find(([f]) => f.event === 'accounting.sync.failed')?.[0];
      expect(warn).toMatchObject({ distributorId: 'dist-1', connectionId: 'conn-1', runId: 'run-7', resourceType: 'widget', statusCode: 403, transient: false });
    });

    it('puts the run back to QUEUED on a transient failure with attempts left, and rethrows it unchanged for the backoff', async () => {
      const rateLimited = new AccountingProviderError('rate limit', true, undefined, 'HTTP_429', { retryAfterMs: 5000 });
      pull.pullImpl = () => Promise.reject(rateLimited);

      await expect(pull.process(job(0))).rejects.toBe(rateLimited);

      expect(runs.requeueForRetry).toHaveBeenCalledWith('run-7', 'rate limit');
      expect(runs.finalizeFailure).not.toHaveBeenCalled();
    });

    it('marks the run FAILED on the last attempt', async () => {
      pull.pullImpl = () => Promise.reject(new AccountingProviderError('HTTP 503', true));
      await pull.process(job(2)).catch(() => undefined);
      expect(runs.finalizeFailure).toHaveBeenCalledWith('run-7', 'HTTP 503');
    });

    it('logs an unexpected (non-provider) failure at error with its stack, and retries it', async () => {
      pull.pullImpl = () => Promise.reject(new TypeError('boom'));

      await pull.process(job(0)).catch(() => undefined);

      const [fields] = (Logger.prototype.error as jest.Mock).mock.calls.find(([f]) => f.event === 'accounting.sync.failed')!;
      expect(fields.err.stack).toContain('TypeError: boom');
      expect(runs.requeueForRetry).toHaveBeenCalled();
    });
  });
});

describe('RunProgress', () => {
  it('heartbeats every HEARTBEAT_ITEM_INTERVAL items, and after a quiet spell by time', async () => {
    const heartbeat = jest.fn();
    let now = 0;
    const progress = new RunProgress({ heartbeat, setTotal: jest.fn() } as unknown as IngestionRunService, 'run-1', () => now);

    for (let i = 0; i < 24; i++) await progress.tick({ recordsProcessed: i + 1 });
    expect(heartbeat).not.toHaveBeenCalled();
    await progress.tick({ recordsProcessed: 25 });
    expect(heartbeat).toHaveBeenCalledWith('run-1', { recordsProcessed: 25 });

    now += 6_000;
    await progress.tick({ recordsProcessed: 26 });
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it('counts a batch as that many items', async () => {
    const heartbeat = jest.fn();
    const progress = new RunProgress({ heartbeat, setTotal: jest.fn() } as unknown as IngestionRunService, 'run-1', () => 0);
    await progress.tick({ recordsProcessed: 25 }, 25);
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });
});
