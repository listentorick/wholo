import { Job } from 'bullmq';
import { AccountingProductMatchMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingProductMatcherService } from '../accounting/matching/accounting-product-matcher.service';
import { AccountingProductSyncProcessor } from './accounting-product-sync.processor';

function makeJob(connectionId = 'conn-1'): Job {
  return {
    name: 'AccountingProductSyncRequested',
    data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: connectionId, payload: {} },
  } as Job;
}

describe('AccountingProductSyncProcessor', () => {
  let processor: AccountingProductSyncProcessor;
  let prisma: any;
  let accountingConnectionService: { getValidTokenSet: jest.Mock };
  let adapters: { get: jest.Mock };
  let matcher: { findBestMatch: jest.Mock };
  let listProducts: jest.Mock;

  const connection = {
    id: 'conn-1',
    distributorId: 'dist-1',
    provider: 'XERO',
    status: 'CONNECTED',
    externalOrganisationId: 'tenant-1',
    lastSyncedAt: null,
  };

  const cachedProductRow = {
    id: 'cached-1',
    externalProductCode: 'CAB-SAUV-001',
    displayName: 'Cabernet Sauvignon 2023',
    isSold: true,
    isActive: true,
    ignoredAt: null,
  };

  beforeEach(() => {
    listProducts = jest.fn().mockResolvedValue([]);
    prisma = {
      accountingConnection: {
        findUnique: jest.fn().mockResolvedValue(connection),
        update: jest.fn().mockResolvedValue({}),
      },
      externalAccountingProduct: {
        upsert: jest.fn().mockResolvedValue(cachedProductRow),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      productAccountingMapping: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      accountingProductMatchSuggestion: {
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
    adapters = { get: jest.fn().mockReturnValue({ listProducts }) };
    matcher = { findBestMatch: jest.fn().mockReturnValue(null) };

    processor = new AccountingProductSyncProcessor(
      prisma as unknown as PrismaService,
      accountingConnectionService as unknown as AccountingConnectionService,
      adapters as unknown as AccountingAdapterRegistry,
      matcher as unknown as AccountingProductMatcherService,
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

  it('fetches a valid token, lists products via the resolved adapter, and updates lastSyncedAt', async () => {
    await processor.process(makeJob());

    expect(accountingConnectionService.getValidTokenSet).toHaveBeenCalledWith('dist-1', 'XERO');
    expect(adapters.get).toHaveBeenCalledWith('XERO');
    expect(listProducts).toHaveBeenCalledWith(expect.anything(), 'tenant-1');
    expect(prisma.accountingConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: { lastSyncedAt: expect.any(Date) },
    });
  });

  it('always does a full fetch, never passing lastSyncedAt as modifiedSince', async () => {
    const since = new Date('2026-01-01T00:00:00.000Z');
    prisma.accountingConnection.findUnique.mockResolvedValue({ ...connection, lastSyncedAt: since });

    await processor.process(makeJob());

    expect(listProducts).toHaveBeenCalledWith(expect.anything(), 'tenant-1');
    expect(listProducts.mock.calls[0]).toHaveLength(2);
  });

  it('upserts an ExternalAccountingProduct row per fetched product', async () => {
    listProducts.mockResolvedValue([
      {
        externalId: 'x-1',
        code: 'CAB-SAUV-001',
        displayName: 'Cabernet Sauvignon 2023',
        salesUnitPrice: '12.3456',
        isSold: true,
        isPurchased: true,
        isTracked: false,
        isActive: true,
        raw: {},
      },
    ]);

    await processor.process(makeJob());

    expect(prisma.externalAccountingProduct.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountingConnectionId_externalProductId: { accountingConnectionId: 'conn-1', externalProductId: 'x-1' },
        },
        create: expect.objectContaining({
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          externalProductId: 'x-1',
          salesUnitPrice: '12.3456',
        }),
      }),
    );
  });

  it('marks cache rows absent from the fetch as inactive (Xero deletes leave no other signal)', async () => {
    listProducts.mockResolvedValue([
      { externalId: 'x-1', code: 'A', displayName: 'A', isSold: true, isPurchased: true, isTracked: false, isActive: true, raw: {} },
    ]);
    prisma.externalAccountingProduct.upsert.mockResolvedValue({ ...cachedProductRow, id: 'cached-present' });

    await processor.process(makeJob());

    expect(prisma.externalAccountingProduct.updateMany).toHaveBeenCalledWith({
      where: {
        accountingConnectionId: 'conn-1',
        id: { notIn: ['cached-present'] },
        isActive: true,
      },
      data: { isActive: false },
    });
  });

  it('does not run the matcher for an inactive product', async () => {
    listProducts.mockResolvedValue([
      { externalId: 'x-1', code: 'A', displayName: 'A', isSold: true, isPurchased: true, isTracked: false, isActive: true, raw: {} },
    ]);
    prisma.externalAccountingProduct.upsert.mockResolvedValue({ ...cachedProductRow, isActive: false });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('does not run the matcher for an ignored product', async () => {
    listProducts.mockResolvedValue([
      { externalId: 'x-1', code: 'A', displayName: 'A', isSold: true, isPurchased: true, isTracked: false, isActive: true, raw: {} },
    ]);
    prisma.externalAccountingProduct.upsert.mockResolvedValue({ ...cachedProductRow, ignoredAt: new Date() });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('runs the matcher for a purchase-only (isSold=false) product', async () => {
    // A purchase-only item can still be a legitimate link target — the
    // computed NOT_SOLD status labels it without suppressing suggestions.
    listProducts.mockResolvedValue([
      { externalId: 'x-1', code: 'A', displayName: 'A', isSold: false, isPurchased: true, isTracked: false, isActive: true, raw: {} },
    ]);
    prisma.externalAccountingProduct.upsert.mockResolvedValue({ ...cachedProductRow, isSold: false });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).toHaveBeenCalled();
  });

  it('does not run the matcher for a product that already has an active mapping', async () => {
    listProducts.mockResolvedValue([
      { externalId: 'x-1', code: 'A', displayName: 'A', isSold: true, isPurchased: true, isTracked: false, isActive: true, raw: {} },
    ]);
    prisma.productAccountingMapping.findFirst.mockResolvedValue({ id: 'mapping-1' });

    await processor.process(makeJob());

    expect(matcher.findBestMatch).not.toHaveBeenCalled();
  });

  it('never creates a mapping, even for a maximum-confidence exact SKU match — suggestion only', async () => {
    listProducts.mockResolvedValue([
      { externalId: 'x-1', code: 'CAB-SAUV-001', displayName: 'A', isSold: true, isPurchased: true, isTracked: false, isActive: true, raw: {} },
    ]);
    matcher.findBestMatch.mockReturnValue({
      candidateId: 'prod-1',
      confidence: 95,
      matchMethod: AccountingProductMatchMethod.SKU_EXACT,
      matchReason: 'Item code matches the product SKU exactly',
    });

    await processor.process(makeJob());

    expect(prisma.accountingProductMatchSuggestion.create).toHaveBeenCalled();
    expect(prisma.productAccountingMapping.findFirst).toHaveBeenCalled();
    // No mapping table writes of any kind from the sync path.
    expect(Object.keys(prisma.productAccountingMapping)).toEqual(['findFirst']);
  });

  describe('suggestion lifecycle', () => {
    beforeEach(() => {
      listProducts.mockResolvedValue([
        { externalId: 'x-1', code: 'CAB-SAUV-001', displayName: 'Cab Sauv', isSold: true, isPurchased: true, isTracked: false, isActive: true, raw: {} },
      ]);
    });

    it('creates a new suggestion when a match is found and none existed before', async () => {
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'prod-1',
        confidence: 95,
        matchMethod: AccountingProductMatchMethod.SKU_EXACT,
        matchReason: 'Item code matches',
      });

      await processor.process(makeJob());

      expect(prisma.accountingProductMatchSuggestion.create).toHaveBeenCalledWith({
        data: {
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          externalProductId: 'cached-1',
          suggestedProductId: 'prod-1',
          confidence: 95,
          matchMethod: AccountingProductMatchMethod.SKU_EXACT,
          matchReason: 'Item code matches',
        },
      });
    });

    it('refreshes an existing SUGGESTED row in place when the proposed match is unchanged', async () => {
      prisma.accountingProductMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedProductId: 'prod-1',
      });
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'prod-1',
        confidence: 40,
        matchMethod: AccountingProductMatchMethod.NAME_FUZZY,
        matchReason: 'still similar',
      });

      await processor.process(makeJob());

      expect(prisma.accountingProductMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { confidence: 40, matchMethod: AccountingProductMatchMethod.NAME_FUZZY, matchReason: 'still similar' },
      });
      expect(prisma.accountingProductMatchSuggestion.create).not.toHaveBeenCalled();
    });

    it('supersedes the old suggestion and creates a new one when the proposed match changes', async () => {
      prisma.accountingProductMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedProductId: 'prod-old',
      });
      matcher.findBestMatch.mockReturnValue({
        candidateId: 'prod-new',
        confidence: 65,
        matchMethod: AccountingProductMatchMethod.NAME_EXACT,
        matchReason: 'name now matches exactly',
      });

      await processor.process(makeJob());

      expect(prisma.accountingProductMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { status: 'SUPERSEDED' },
      });
      expect(prisma.accountingProductMatchSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ suggestedProductId: 'prod-new' }) }),
      );
    });

    it('supersedes the old suggestion and creates nothing when no match is found anymore', async () => {
      prisma.accountingProductMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedProductId: 'prod-old',
      });
      matcher.findBestMatch.mockReturnValue(null);

      await processor.process(makeJob());

      expect(prisma.accountingProductMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: { status: 'SUPERSEDED' },
      });
      expect(prisma.accountingProductMatchSuggestion.create).not.toHaveBeenCalled();
    });
  });
});
