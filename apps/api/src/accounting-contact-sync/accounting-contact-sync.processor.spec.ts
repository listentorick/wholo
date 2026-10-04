import { Job } from 'bullmq';
import { AccountingContactMatchMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingContactMatcherService } from '../accounting/matching/accounting-contact-matcher.service';
import { AccountingChangeDetectionService } from '../accounting/accounting-change-detection.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
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
  let adapters: { get: jest.Mock; displayName: jest.Mock };
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
    accountingOrganisationId: 'acc-org-1',
    organisation: { id: 'acc-org-1', externalOrganisationId: 'tenant-1', name: 'Acme Wines', invoiceExportTargetStatus: 'DRAFT' },
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
      displayName: jest.fn().mockReturnValue('Xero'),
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

  // The run lifecycle (connection checks, claim, full vs incremental, failure
  // policy) is shared by every pull and tested once, in
  // accounting/sync/accounting-pull-processor.base.spec.ts. This spec covers
  // the contact pipeline only.

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

  it('upserts an ExternalAccountingContact row per fetched contact', async () => {
    listContacts.mockResolvedValue([
      { externalId: 'x-1', displayName: 'Blackbird Vine & Co', isCustomer: true, isSupplier: false, isArchived: false, raw: {} },
    ]);

    await processor.process(makeJob());

    expect(prisma.externalAccountingContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountingOrganisationId_externalContactId: { accountingOrganisationId: 'acc-org-1', externalContactId: 'x-1' } },
        create: expect.objectContaining({ distributorId: 'dist-1', accountingOrganisationId: 'acc-org-1', externalContactId: 'x-1' }),
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
          accountingOrganisationId: 'acc-org-1',
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
