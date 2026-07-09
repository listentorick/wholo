import { Job } from 'bullmq';
import { AccountingContactMatchMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingContactMatcherService } from '../accounting/matching/accounting-contact-matcher.service';
import { AccountingContactSyncProcessor } from './accounting-contact-sync.processor';

function makeJob(connectionId = 'conn-1'): Job {
  return {
    name: 'AccountingContactSyncRequested',
    data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: connectionId, payload: {} },
  } as Job;
}

describe('AccountingContactSyncProcessor', () => {
  let processor: AccountingContactSyncProcessor;
  let prisma: any;
  let accountingConnectionService: { getValidTokenSet: jest.Mock };
  let adapters: { get: jest.Mock };
  let matcher: { findBestMatch: jest.Mock };
  let listContacts: jest.Mock;

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
        upsert: jest.fn().mockResolvedValue(cachedContactRow),
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
    adapters = { get: jest.fn().mockReturnValue({ listContacts }) };
    matcher = { findBestMatch: jest.fn().mockReturnValue(null) };

    processor = new AccountingContactSyncProcessor(
      prisma as unknown as PrismaService,
      accountingConnectionService as unknown as AccountingConnectionService,
      adapters as unknown as AccountingAdapterRegistry,
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

  it('fetches a valid token, lists contacts via the resolved adapter, and updates lastSyncedAt', async () => {
    await processor.process(makeJob());

    expect(accountingConnectionService.getValidTokenSet).toHaveBeenCalledWith('dist-1', 'XERO');
    expect(adapters.get).toHaveBeenCalledWith('XERO');
    expect(listContacts).toHaveBeenCalledWith(expect.anything(), 'tenant-1');
    expect(prisma.accountingConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: { lastSyncedAt: expect.any(Date) },
    });
  });

  it('always does a full fetch, never passing lastSyncedAt as modifiedSince', async () => {
    // lastSyncedAt also means "last token refresh" (see
    // AccountingConnectionService.getValidTokenSet) — reusing it as an
    // incremental-sync cursor previously caused Xero to silently return zero
    // contacts whenever a token refresh happened after the contacts were
    // last modified. Every sync must be a full fetch until this feature
    // gets its own dedicated cursor field.
    const since = new Date('2026-01-01T00:00:00.000Z');
    prisma.accountingConnection.findUnique.mockResolvedValue({ ...connection, lastSyncedAt: since });

    await processor.process(makeJob());

    expect(listContacts).toHaveBeenCalledWith(expect.anything(), 'tenant-1');
    expect(listContacts.mock.calls[0]).toHaveLength(2);
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
        tradeRelationshipId: 'tr-1',
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
        tradeRelationshipId: 'tr-1',
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
        tradeRelationshipId: 'tr-new',
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
});
