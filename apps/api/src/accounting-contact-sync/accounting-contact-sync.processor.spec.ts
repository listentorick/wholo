import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AccountingContactMatchMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingContactMatcherService } from '../accounting/matching/accounting-contact-matcher.service';
import { AccountingChangeDetectionService } from '../accounting/accounting-change-detection.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AccountingProviderError } from '../accounting/adapters/accounting-provider.error';
import { AccountingContactSyncProcessor } from './accounting-contact-sync.processor';

function makeJob(connectionId = 'conn-1', payload: Record<string, unknown> = {}): Job {
  return {
    name: 'AccountingContactSyncRequested',
    data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: connectionId, payload },
  } as Job;
}

describe('AccountingContactSyncProcessor', () => {
  let processor: AccountingContactSyncProcessor;
  let prisma: any;
  let accountingConnectionService: { getValidTokenSet: jest.Mock };
  let adapters: { get: jest.Mock };
  let matcher: { findBestMatch: jest.Mock };
  let listContacts: jest.Mock;
  let ingestionRuns: {
    ensureRun: jest.Mock;
    claim: jest.Mock;
    setTotal: jest.Mock;
    heartbeat: jest.Mock;
    finalizeSuccess: jest.Mock;
    finalizeFailure: jest.Mock;
  };

  const connection = {
    id: 'conn-1',
    distributorId: 'dist-1',
    provider: 'XERO',
    status: 'CONNECTED',
    externalOrganisationId: 'tenant-1',
    lastSyncedAt: null,
  };

  const cachedContactRow = {
    id: 'cached-1',
    externalContactCode: 'XC-1',
    externalAccountNumber: null,
    displayName: 'Blackbird Vine & Co',
    email: 'billing@blackbird.example',
    billingPostcode: 'E1 1AA',
    isCustomer: true,
    isArchived: false,
    ignoredAt: null,
  };

  beforeEach(() => {
    listContacts = jest.fn().mockResolvedValue([]);
    prisma = {
      accountingConnection: {
        findUnique: jest.fn().mockResolvedValue(connection),
        update: jest.fn().mockResolvedValue({}),
      },
      externalAccountingContact: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(cachedContactRow),
        update: jest.fn().mockResolvedValue({}),
      },
      tradeRelationship: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      customerAccountingMapping: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      accountingContactMatchSuggestion: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    accountingConnectionService = {
      getValidTokenSet: jest.fn().mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date().toISOString(),
        scope: 'openid accounting.contacts',
      }),
    };
    // The adapter returns a page ({ records, nextCursor }); tests stub just
    // the records via `listContacts` and assert on the cursor it was given.
    adapters = {
      get: jest.fn().mockReturnValue({
        listContacts: async (...args: unknown[]) => ({ records: await listContacts(...args), nextCursor: 'cursor-next' }),
      }),
    };
    matcher = { findBestMatch: jest.fn().mockReturnValue(null) };
    const changeDetection = { detectAndFlag: jest.fn().mockResolvedValue(undefined) };
    ingestionRuns = {
      ensureRun: jest.fn().mockResolvedValue('run-1'),
      claim: jest.fn().mockResolvedValue({ id: 'run-1' }),
      setTotal: jest.fn().mockResolvedValue(undefined),
      heartbeat: jest.fn().mockResolvedValue(undefined),
      finalizeSuccess: jest.fn().mockResolvedValue(undefined),
      finalizeFailure: jest.fn().mockResolvedValue(undefined),
    };

    processor = new AccountingContactSyncProcessor(
      prisma as unknown as PrismaService,
      accountingConnectionService as unknown as AccountingConnectionService,
      adapters as unknown as AccountingAdapterRegistry,
      changeDetection as unknown as AccountingChangeDetectionService,
      ingestionRuns as unknown as IngestionRunService,
      matcher as unknown as AccountingContactMatcherService,
    );
  });

  it('skips silently when the connection no longer exists', async () => {
    prisma.accountingConnection.findUnique.mockResolvedValue(null);
    await processor.process(makeJob());
    expect(accountingConnectionService.getValidTokenSet).not.toHaveBeenCalled();
  });

  it('skips when the connection is not CONNECTED', async () => {
    prisma.accountingConnection.findUnique.mockResolvedValue({ ...connection, status: 'DISCONNECTED' });
    await processor.process(makeJob());
    expect(accountingConnectionService.getValidTokenSet).not.toHaveBeenCalled();
  });

  it('marks the run FAILED when the connection is gone and the job carries a runId', async () => {
    prisma.accountingConnection.findUnique.mockResolvedValue(null);
    await processor.process(makeJob('conn-1', { runId: 'run-9' }));
    expect(ingestionRuns.finalizeFailure).toHaveBeenCalledWith('run-9', expect.any(String));
  });

  it('drives the ingestion run: claim → setTotal → finalizeSuccess', async () => {
    listContacts.mockResolvedValue([
      { externalId: 'x-1', displayName: 'Blackbird', isCustomer: true, isSupplier: false, isArchived: false, raw: {} },
    ]);
    await processor.process(makeJob('conn-1', { runId: 'run-7' }));
    expect(ingestionRuns.claim).toHaveBeenCalledWith('run-7');
    expect(ingestionRuns.ensureRun).not.toHaveBeenCalled();
    expect(ingestionRuns.setTotal).toHaveBeenCalledWith('run-7', 1);
    expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith('run-7', expect.any(Object), expect.anything());
  });

  it('does nothing when the run cannot be claimed (already running or done)', async () => {
    ingestionRuns.claim.mockResolvedValue(null);
    await processor.process(makeJob('conn-1', { runId: 'run-7' }));
    expect(accountingConnectionService.getValidTokenSet).not.toHaveBeenCalled();
  });

  it('marks the run FAILED and rethrows when the provider fetch throws', async () => {
    listContacts.mockRejectedValue(new Error('Xero 500'));
    await expect(processor.process(makeJob('conn-1', { runId: 'run-7' }))).rejects.toThrow('Xero 500');
    expect(ingestionRuns.finalizeFailure).toHaveBeenCalledWith('run-7', 'Xero 500');
  });

  it('recreates a run row for a legacy job with no runId in the payload', async () => {
    await processor.process(makeJob());
    expect(ingestionRuns.ensureRun).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'accounting', sourceRef: 'conn-1', resourceType: 'contact' }),
    );
    expect(ingestionRuns.claim).toHaveBeenCalledWith('run-1');
  });

  it('fetches a valid token, lists contacts via the resolved adapter, and updates lastSyncedAt', async () => {
    await processor.process(makeJob());

    expect(accountingConnectionService.getValidTokenSet).toHaveBeenCalledWith('dist-1', 'XERO');
    expect(adapters.get).toHaveBeenCalledWith('XERO');
    expect(listContacts).toHaveBeenCalledWith(expect.anything(), 'tenant-1', null);
    expect(prisma.accountingConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: { lastSyncedAt: expect.any(Date) },
    });
  });

  describe('full vs incremental pulls', () => {
    const scheduledRun = (overrides: Record<string, unknown> = {}) => ({
      id: 'run-7',
      trigger: 'SCHEDULED',
      cursor: 'cursor-stored',
      lastFullRunAt: new Date(),
      ...overrides,
    });

    it('does a full pull (null cursor) when the run has no cursor yet — never connection.lastSyncedAt', async () => {
      prisma.accountingConnection.findUnique.mockResolvedValue({ ...connection, lastSyncedAt: new Date('2026-01-01') });
      ingestionRuns.claim.mockResolvedValue(scheduledRun({ cursor: null }));

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(listContacts).toHaveBeenCalledWith(expect.anything(), 'tenant-1', null);
      expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith('run-7', expect.any(Object), {
        cursor: 'cursor-next',
        full: true,
      });
    });

    it('pulls incrementally from the stored cursor on a scheduled run', async () => {
      ingestionRuns.claim.mockResolvedValue(scheduledRun());

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(listContacts).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'cursor-stored');
      expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith('run-7', expect.any(Object), {
        cursor: 'cursor-next',
        full: false,
      });
    });

    it('always pulls in full when a person asked (manual Sync)', async () => {
      ingestionRuns.claim.mockResolvedValue(scheduledRun({ trigger: 'MANUAL' }));

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(listContacts).toHaveBeenCalledWith(expect.anything(), 'tenant-1', null);
    });

    it('falls back to a full pull once the last full one is a day old', async () => {
      ingestionRuns.claim.mockResolvedValue(scheduledRun({ lastFullRunAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }));

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(listContacts).toHaveBeenCalledWith(expect.anything(), 'tenant-1', null);
    });
  });

  describe('failures', () => {
    it('stops BullMQ retrying a permanent provider rejection, and logs it with its ids', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      listContacts.mockRejectedValue(
        new AccountingProviderError('Xero getContacts failed with HTTP 403', false, undefined, 'HTTP_403', { statusCode: 403 }),
      );

      const err = await processor.process(makeJob('conn-1', { runId: 'run-7' })).catch((e) => e);

      expect(err).toBeInstanceOf(UnrecoverableError);
      expect(ingestionRuns.finalizeFailure).toHaveBeenCalledWith('run-7', 'Xero getContacts failed with HTTP 403');
      expect(warn.mock.calls.find(([f]) => (f as { event?: string }).event === 'accounting.sync.failed')?.[0]).toMatchObject({
        distributorId: 'dist-1',
        connectionId: 'conn-1',
        runId: 'run-7',
        resourceType: 'contact',
        statusCode: 403,
        transient: false,
      });
      warn.mockRestore();
    });

    it('puts the run back to QUEUED on a transient failure with attempts left, so the retry can claim it', async () => {
      (ingestionRuns as unknown as { requeueForRetry: jest.Mock }).requeueForRetry = jest.fn().mockResolvedValue(undefined);
      listContacts.mockRejectedValue(new AccountingProviderError('Xero 503', true, undefined, 'HTTP_503'));
      const job = { ...makeJob('conn-1', { runId: 'run-7' }), attemptsMade: 0, opts: { attempts: 3 } } as unknown as Job;

      await processor.process(job).catch(() => undefined);

      expect((ingestionRuns as unknown as { requeueForRetry: jest.Mock }).requeueForRetry).toHaveBeenCalledWith('run-7', 'Xero 503');
      expect(ingestionRuns.finalizeFailure).not.toHaveBeenCalled();
    });

    it('marks the run FAILED on the last attempt', async () => {
      listContacts.mockRejectedValue(new AccountingProviderError('Xero 503', true, undefined, 'HTTP_503'));
      const job = { ...makeJob('conn-1', { runId: 'run-7' }), attemptsMade: 2, opts: { attempts: 3 } } as unknown as Job;

      await processor.process(job).catch(() => undefined);

      expect(ingestionRuns.finalizeFailure).toHaveBeenCalledWith('run-7', 'Xero 503');
    });

    it('rethrows a transient provider failure unchanged so the backoff can honour Retry-After', async () => {
      const rateLimited = new AccountingProviderError('Xero rate limit', true, undefined, 'HTTP_429', { retryAfterMs: 5_000 });
      listContacts.mockRejectedValue(rateLimited);

      await expect(processor.process(makeJob('conn-1', { runId: 'run-7' }))).rejects.toBe(rateLimited);
    });

    it('logs an unexpected (non-provider) failure at error, with the stack', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      listContacts.mockRejectedValue(new TypeError('boom'));

      await processor.process(makeJob('conn-1', { runId: 'run-7' })).catch(() => undefined);

      const [fields] = error.mock.calls.find(([f]) => (f as { event?: string }).event === 'accounting.sync.failed')!;
      expect((fields as { err: Error }).err.stack).toContain('TypeError: boom');
      error.mockRestore();
    });
  });

  it('upserts an ExternalAccountingContact row per fetched contact', async () => {
    listContacts.mockResolvedValue([
      { externalId: 'x-1', displayName: 'Blackbird Vine & Co', isCustomer: true, isSupplier: false, isArchived: false, raw: {} },
    ]);

    await processor.process(makeJob());

    expect(prisma.externalAccountingContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountingConnectionId_externalContactId: { accountingConnectionId: 'conn-1', externalContactId: 'x-1' } },
        create: expect.objectContaining({ distributorId: 'dist-1', accountingConnectionId: 'conn-1', externalContactId: 'x-1' }),
      }),
    );
  });

  it('mirrors billing and delivery address fields onto the cache row', async () => {
    listContacts.mockResolvedValue([
      {
        externalId: 'x-1',
        displayName: 'Blackbird Vine & Co',
        isCustomer: true,
        isSupplier: false,
        isArchived: false,
        billingLine1: 'PO Box 42',
        billingCity: 'London',
        deliveryLine1: '1 Vine Street',
        deliveryCity: 'London',
        raw: {},
      },
    ]);

    await processor.process(makeJob());

    expect(prisma.externalAccountingContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          billingLine1: 'PO Box 42',
          billingCity: 'London',
          deliveryLine1: '1 Vine Street',
          deliveryCity: 'London',
        }),
        update: expect.objectContaining({
          billingLine1: 'PO Box 42',
          billingCity: 'London',
          deliveryLine1: '1 Vine Street',
          deliveryCity: 'London',
        }),
      }),
    );
  });

  it('does not run the matcher for an archived contact', async () => {
    listContacts.mockResolvedValue([{ externalId: 'x-1', displayName: 'X', isCustomer: true, isSupplier: false, isArchived: true, raw: {} }]);
    prisma.externalAccountingContact.upsert.mockResolvedValue({ ...cachedContactRow, isArchived: true });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('does not run the matcher for an ignored contact', async () => {
    listContacts.mockResolvedValue([{ externalId: 'x-1', displayName: 'X', isCustomer: true, isSupplier: false, isArchived: false, raw: {} }]);
    prisma.externalAccountingContact.upsert.mockResolvedValue({ ...cachedContactRow, ignoredAt: new Date() });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('runs the matcher for a supplier-flagged or untransacted contact, not just isCustomer:true ones', async () => {
    // isCustomer/isSupplier are set automatically by Xero based on
    // transaction history, not a business classification — a strong signal
    // like an exact account-code match should still surface regardless.
    listContacts.mockResolvedValue([{ externalId: 'x-1', displayName: 'X', isCustomer: false, isSupplier: true, isArchived: false, raw: {} }]);
    prisma.externalAccountingContact.upsert.mockResolvedValue({ ...cachedContactRow, isCustomer: false });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).toHaveBeenCalled();
  });

  it('does not run the matcher for a contact that already has an active mapping', async () => {
    listContacts.mockResolvedValue([{ externalId: 'x-1', displayName: 'X', isCustomer: true, isSupplier: false, isArchived: false, raw: {} }]);
    prisma.customerAccountingMapping.findFirst.mockResolvedValue({ id: 'mapping-1' });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  describe('suggestion lifecycle', () => {
    beforeEach(() => {
      listContacts.mockResolvedValue([{ externalId: 'x-1', displayName: 'Blackbird', isCustomer: true, isSupplier: false, isArchived: false, raw: {} }]);
    });

    it('creates a new suggestion when a match is found and none existed before', async () => {
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'tr-1',
        confidence: 95,
        matchMethod: AccountingContactMatchMethod.ACCOUNT_CODE_EXACT,
        matchReason: 'Account number matches',
      });

      await processor.process(makeJob());

      expect(prisma.accountingContactMatchSuggestion.create).toHaveBeenCalledWith({
        data: {
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          externalContactId: 'cached-1',
          suggestedTradeRelationshipId: 'tr-1',
          confidence: 95,
          matchMethod: AccountingContactMatchMethod.ACCOUNT_CODE_EXACT,
          matchReason: 'Account number matches',
        },
      });
    });

    it('refreshes an existing SUGGESTED row in place when the proposed match is unchanged', async () => {
      prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTradeRelationshipId: 'tr-1',
      });
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'tr-1',
        confidence: 42,
        matchMethod: AccountingContactMatchMethod.NAME_FUZZY,
        matchReason: 'still similar',
      });

      await processor.process(makeJob());

      expect(prisma.accountingContactMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { confidence: 42, matchMethod: AccountingContactMatchMethod.NAME_FUZZY, matchReason: 'still similar' },
      });
      expect(prisma.accountingContactMatchSuggestion.create).not.toHaveBeenCalled();
    });

    it('supersedes the old suggestion and creates a new one when the proposed match changes', async () => {
      prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTradeRelationshipId: 'tr-old',
      });
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'tr-new',
        confidence: 70,
        matchMethod: AccountingContactMatchMethod.NAME_EXACT,
        matchReason: 'name now matches exactly',
      });

      await processor.process(makeJob());

      expect(prisma.accountingContactMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { status: 'SUPERSEDED' },
      });
      expect(prisma.accountingContactMatchSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ suggestedTradeRelationshipId: 'tr-new' }) }),
      );
    });

    it('supersedes the old suggestion and creates nothing when no match is found anymore', async () => {
      prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTradeRelationshipId: 'tr-old',
      });
      matcher.findBestMatch.mockReturnValue(null);

      await processor.process(makeJob());

      expect(prisma.accountingContactMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { status: 'SUPERSEDED' },
      });
      expect(prisma.accountingContactMatchSuggestion.create).not.toHaveBeenCalled();
    });
  });

  describe('sync-complete change breakdown', () => {
    const fetched = (over: Record<string, unknown> = {}) => ({
      externalId: 'x-1',
      displayName: 'Blackbird Vine & Co',
      isCustomer: true,
      isSupplier: false,
      isArchived: false,
      raw: {},
      ...over,
    });

    it('counts a contact with no prior cache row as new', async () => {
      listContacts.mockResolvedValue([fetched()]);
      prisma.externalAccountingContact.findUnique.mockResolvedValue(null);

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith(
        'run-7',
        expect.objectContaining({ recordsCreated: 1, recordsUpdated: 0, recordsRemoved: 0 }),
        expect.anything(),
      );
    });

    it('counts a contact whose stored fields moved as updated', async () => {
      listContacts.mockResolvedValue([fetched({ displayName: 'Blackbird Wines Ltd' })]);
      prisma.externalAccountingContact.findUnique.mockResolvedValue({ ...cachedContactRow, displayName: 'Blackbird Vine & Co' });
      prisma.externalAccountingContact.upsert.mockResolvedValue({ ...cachedContactRow, displayName: 'Blackbird Wines Ltd' });

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith(
        'run-7',
        expect.objectContaining({ recordsCreated: 0, recordsUpdated: 1, recordsRemoved: 0 }),
        expect.anything(),
      );
    });

    it('counts a re-seen contact with identical fields as unchanged', async () => {
      listContacts.mockResolvedValue([fetched()]);
      prisma.externalAccountingContact.findUnique.mockResolvedValue({ ...cachedContactRow });
      prisma.externalAccountingContact.upsert.mockResolvedValue({ ...cachedContactRow });

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith(
        'run-7',
        expect.objectContaining({ recordsCreated: 0, recordsUpdated: 0, recordsRemoved: 0 }),
        expect.anything(),
      );
    });

    it('counts a contact that flipped to archived in Xero as removed, not updated', async () => {
      listContacts.mockResolvedValue([fetched({ isArchived: true })]);
      prisma.externalAccountingContact.findUnique.mockResolvedValue({ ...cachedContactRow, isArchived: false });
      prisma.externalAccountingContact.upsert.mockResolvedValue({ ...cachedContactRow, isArchived: true });

      await processor.process(makeJob('conn-1', { runId: 'run-7' }));

      expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith(
        'run-7',
        expect.objectContaining({ recordsCreated: 0, recordsUpdated: 0, recordsRemoved: 1 }),
        expect.anything(),
      );
    });
  });
});
