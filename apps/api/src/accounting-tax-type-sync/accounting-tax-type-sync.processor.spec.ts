import { Job } from 'bullmq';
import { AccountingTaxTypeMatchMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingTaxTypeMatcherService } from '../accounting/matching/accounting-tax-type-matcher.service';
import { AccountingChangeDetectionService } from '../accounting/accounting-change-detection.service';
import { AccountingTaxTypeSyncProcessor } from './accounting-tax-type-sync.processor';

function makeJob(connectionId = 'conn-1'): Job {
  return {
    name: 'AccountingTaxTypeSyncRequested',
    data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: connectionId, payload: {} },
  } as Job;
}

describe('AccountingTaxTypeSyncProcessor', () => {
  let processor: AccountingTaxTypeSyncProcessor;
  let prisma: any;
  let accountingConnectionService: { getValidTokenSet: jest.Mock };
  let adapters: { get: jest.Mock };
  let matcher: { findBestMatch: jest.Mock };
  let changeDetection: { detectAndFlag: jest.Mock };
  let listTaxRates: jest.Mock;

  const connection = {
    id: 'conn-1',
    distributorId: 'dist-1',
    provider: 'XERO',
    status: 'CONNECTED',
    externalOrganisationId: 'tenant-1',
    lastSyncedAt: null,
  };

  const cachedTaxTypeRow = {
    id: 'cached-1',
    taxType: 'OUTPUT2',
    displayName: 'Standard rate',
    isActive: true,
    ignoredAt: null,
  };

  beforeEach(() => {
    listTaxRates = jest.fn().mockResolvedValue([]);
    prisma = {
      accountingConnection: {
        findUnique: jest.fn().mockResolvedValue(connection),
        update: jest.fn().mockResolvedValue({}),
      },
      externalAccountingTaxType: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(cachedTaxTypeRow),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      taxType: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      taxTypeAccountingMapping: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      accountingTaxTypeMatchSuggestion: {
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
        scope: 'openid accounting.settings',
      }),
    };
    adapters = { get: jest.fn().mockReturnValue({ listTaxRates }) };
    matcher = { findBestMatch: jest.fn().mockReturnValue(null) };
    changeDetection = { detectAndFlag: jest.fn().mockResolvedValue(undefined) };

    processor = new AccountingTaxTypeSyncProcessor(
      prisma as unknown as PrismaService,
      accountingConnectionService as unknown as AccountingConnectionService,
      adapters as unknown as AccountingAdapterRegistry,
      changeDetection as unknown as AccountingChangeDetectionService,
      matcher as unknown as AccountingTaxTypeMatcherService,
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

  it('fetches a valid token, lists tax rates via the resolved adapter, and updates lastSyncedAt', async () => {
    await processor.process(makeJob());

    expect(accountingConnectionService.getValidTokenSet).toHaveBeenCalledWith('dist-1', 'XERO');
    expect(adapters.get).toHaveBeenCalledWith('XERO');
    expect(listTaxRates).toHaveBeenCalledWith(expect.anything(), 'tenant-1');
    expect(prisma.accountingConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: { lastSyncedAt: expect.any(Date) },
    });
  });

  it('upserts an ExternalAccountingTaxType row per fetched tax rate, keyed by (connection, taxType code)', async () => {
    listTaxRates.mockResolvedValue([
      { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
    ]);

    await processor.process(makeJob());

    expect(prisma.externalAccountingTaxType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountingConnectionId_taxType: { accountingConnectionId: 'conn-1', taxType: 'OUTPUT2' } },
        create: expect.objectContaining({
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          taxType: 'OUTPUT2',
          displayName: 'Standard rate',
        }),
      }),
    );
  });

  it('runs change detection against the previous cache row for each fetched tax rate', async () => {
    const previous = { ...cachedTaxTypeRow, ratePercentage: '10.0000' };
    listTaxRates.mockResolvedValue([
      { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
    ]);
    prisma.externalAccountingTaxType.findUnique.mockResolvedValue(previous);
    prisma.externalAccountingTaxType.upsert.mockResolvedValue({ ...cachedTaxTypeRow, ratePercentage: '20.0000' });

    await processor.process(makeJob());

    expect(changeDetection.detectAndFlag).toHaveBeenCalledWith(
      expect.objectContaining({
        distributorId: 'dist-1',
        previous,
        current: { ...cachedTaxTypeRow, ratePercentage: '20.0000' },
        fields: ['ratePercentage', 'isActive', 'displayName'],
      }),
    );
  });

  it('marks cache rows absent from the fetch as inactive', async () => {
    listTaxRates.mockResolvedValue([
      { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
    ]);
    prisma.externalAccountingTaxType.upsert.mockResolvedValue({ ...cachedTaxTypeRow, id: 'cached-present' });

    await processor.process(makeJob());

    expect(prisma.externalAccountingTaxType.updateMany).toHaveBeenCalledWith({
      where: {
        accountingConnectionId: 'conn-1',
        id: { notIn: ['cached-present'] },
        isActive: true,
      },
      data: { isActive: false },
    });
  });

  it('does not run the matcher for an inactive tax rate', async () => {
    listTaxRates.mockResolvedValue([
      { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
    ]);
    prisma.externalAccountingTaxType.upsert.mockResolvedValue({ ...cachedTaxTypeRow, isActive: false });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('does not run the matcher for an ignored tax rate', async () => {
    listTaxRates.mockResolvedValue([
      { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
    ]);
    prisma.externalAccountingTaxType.upsert.mockResolvedValue({ ...cachedTaxTypeRow, ignoredAt: new Date() });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('does not run the matcher for a tax rate that already has an active mapping', async () => {
    listTaxRates.mockResolvedValue([
      { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
    ]);
    prisma.taxTypeAccountingMapping.findFirst.mockResolvedValue({ id: 'mapping-1' });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('loads only unmapped, active Wholo tax types as match candidates', async () => {
    await processor.process(makeJob());

    expect(prisma.taxType.findMany).toHaveBeenCalledWith({
      where: {
        distributorId: 'dist-1',
        active: true,
        accountingMappings: { none: { accountingConnectionId: 'conn-1', unlinkedAt: null } },
      },
      select: { id: true, name: true },
    });
  });

  it('never creates a mapping, even for a maximum-confidence exact-name match — suggestion only', async () => {
    listTaxRates.mockResolvedValue([
      { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
    ]);
    matcher.findBestMatch.mockReturnValue({
      candidateId: 'tt-1',
      confidence: 90,
      matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
      matchReason: 'Tax rate name matches exactly',
    });

    await processor.process(makeJob());

    expect(prisma.accountingTaxTypeMatchSuggestion.create).toHaveBeenCalled();
    // No mapping table writes of any kind from the sync path.
    expect(Object.keys(prisma.taxTypeAccountingMapping)).toEqual(['findFirst']);
  });

  describe('suggestion lifecycle', () => {
    beforeEach(() => {
      listTaxRates.mockResolvedValue([
        { taxType: 'OUTPUT2', displayName: 'Standard rate', ratePercentage: '20.0000', isActive: true, raw: {} },
      ]);
    });

    it('creates a new suggestion when a match is found and none existed before', async () => {
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'tt-1',
        confidence: 90,
        matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
        matchReason: 'Exact name match',
      });

      await processor.process(makeJob());

      expect(prisma.accountingTaxTypeMatchSuggestion.create).toHaveBeenCalledWith({
        data: {
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          externalTaxTypeId: 'cached-1',
          suggestedTaxTypeId: 'tt-1',
          confidence: 90,
          matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
          matchReason: 'Exact name match',
        },
      });
    });

    it('refreshes an existing SUGGESTED row in place when the proposed match is unchanged', async () => {
      prisma.accountingTaxTypeMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTaxTypeId: 'tt-1',
      });
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'tt-1',
        confidence: 34,
        matchMethod: AccountingTaxTypeMatchMethod.NAME_FUZZY,
        matchReason: 'still similar',
      });

      await processor.process(makeJob());

      expect(prisma.accountingTaxTypeMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { confidence: 34, matchMethod: AccountingTaxTypeMatchMethod.NAME_FUZZY, matchReason: 'still similar' },
      });
      expect(prisma.accountingTaxTypeMatchSuggestion.create).not.toHaveBeenCalled();
    });

    it('supersedes the old suggestion and creates a new one when the proposed match changes', async () => {
      prisma.accountingTaxTypeMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTaxTypeId: 'tt-old',
      });
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'tt-new',
        confidence: 90,
        matchMethod: AccountingTaxTypeMatchMethod.NAME_EXACT,
        matchReason: 'name now matches exactly',
      });

      await processor.process(makeJob());

      expect(prisma.accountingTaxTypeMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { status: 'SUPERSEDED' },
      });
      expect(prisma.accountingTaxTypeMatchSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ suggestedTaxTypeId: 'tt-new' }) }),
      );
    });

    it('supersedes the old suggestion and creates nothing when no match is found anymore', async () => {
      prisma.accountingTaxTypeMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTaxTypeId: 'tt-old',
      });
      matcher.findBestMatch.mockReturnValue(null);

      await processor.process(makeJob());

      expect(prisma.accountingTaxTypeMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { status: 'SUPERSEDED' },
      });
      expect(prisma.accountingTaxTypeMatchSuggestion.create).not.toHaveBeenCalled();
    });
  });
});
