import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountingContactMatchMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AdminCustomersService } from '../admin-customers/admin-customers.service';
import { AccountingContactService } from './accounting-contact.service';

function makePrismaMock() {
  const prisma: any = {
    accountingConnection: { findFirst: jest.fn() },
    externalAccountingContact: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    customerAccountingMapping: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    accountingContactMatchSuggestion: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    tradeRelationship: { findFirst: jest.fn() },
  };
  prisma.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

const activeConnection = { id: 'conn-1', distributorId: 'dist-1', status: 'CONNECTED' };

describe('AccountingContactService', () => {
  let service: AccountingContactService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let outbox: { writeEvent: jest.Mock };
  let adminCustomers: { create: jest.Mock };

  beforeEach(() => {
    prisma = makePrismaMock();
    prisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
    outbox = { writeEvent: jest.fn().mockResolvedValue({}) };
    adminCustomers = { create: jest.fn() };
    service = new AccountingContactService(
      prisma as unknown as PrismaService,
      outbox as unknown as OutboxService,
      adminCustomers as unknown as AdminCustomersService,
    );
  });

  describe('listContacts', () => {
    it('throws NotFoundException when the distributor has no active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(service.listContacts('dist-1', {})).rejects.toThrow(NotFoundException);
    });

    function row(overrides: Record<string, unknown> = {}) {
      return {
        id: 'contact-1',
        displayName: 'Blackbird Vine & Co',
        email: 'billing@blackbird.example',
        externalContactCode: 'XC-1',
        externalAccountNumber: null,
        isCustomer: true,
        isSupplier: false,
        isArchived: false,
        ignoredAt: null,
        mappings: [],
        suggestions: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        ...overrides,
      };
    }

    it('computes LINKED for a contact with an active mapping', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([
        row({
          mappings: [
            { id: 'map-1', tradeRelationshipId: 'tr-1', matchMethod: 'MANUAL', linkedAt: new Date(), tradeRelationship: { customer: { id: 'org-1', name: 'Blackbird Vine & Co' } } },
          ],
        }),
      ]);
      const { data } = await service.listContacts('dist-1', {});
      expect(data[0].status).toBe('LINKED');
      expect(data[0].mapping?.customerName).toBe('Blackbird Vine & Co');
    });

    it('computes SUGGESTED for a contact with a pending suggestion', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([
        row({
          suggestions: [
            {
              id: 'sugg-1',
              suggestedTradeRelationshipId: 'tr-1',
              confidence: 95,
              matchMethod: 'ACCOUNT_CODE_EXACT',
              matchReason: 'Account number matches',
              suggestedTradeRelationship: { customer: { id: 'org-1', name: 'Blackbird Vine & Co' } },
            },
          ],
        }),
      ]);
      const { data } = await service.listContacts('dist-1', {});
      expect(data[0].status).toBe('SUGGESTED');
      expect(data[0].suggestion?.confidence).toBe(95);
    });

    it('computes CONFLICT when the suggested trade relationship appears in more than one active suggestion', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([
        row({
          suggestions: [
            {
              id: 'sugg-1',
              suggestedTradeRelationshipId: 'tr-shared',
              confidence: 40,
              matchMethod: 'NAME_FUZZY',
              matchReason: 'similar name',
              suggestedTradeRelationship: { customer: { id: 'org-1', name: 'Blackbird Vine & Co' } },
            },
          ],
        }),
      ]);
      prisma.accountingContactMatchSuggestion.groupBy.mockResolvedValue([
        { suggestedTradeRelationshipId: 'tr-shared', _count: { _all: 2 } },
      ]);
      const { data } = await service.listContacts('dist-1', {});
      expect(data[0].status).toBe('CONFLICT');
    });

    it('computes IGNORED when ignoredAt is set and there is no active suggestion', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([row({ ignoredAt: new Date() })]);
      const { data } = await service.listContacts('dist-1', {});
      expect(data[0].status).toBe('IGNORED');
    });

    it('computes ARCHIVED when isArchived is set and there is no active suggestion', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([row({ isArchived: true })]);
      const { data } = await service.listContacts('dist-1', {});
      expect(data[0].status).toBe('ARCHIVED');
    });

    it('defaults to READY_TO_IMPORT when nothing else applies', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([row()]);
      const { data } = await service.listContacts('dist-1', {});
      expect(data[0].status).toBe('READY_TO_IMPORT');
    });

    it('computes NOT_A_CUSTOMER for a supplier-only contact, never READY_TO_IMPORT', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([
        row({ isCustomer: false, isSupplier: true }),
      ]);
      const { data } = await service.listContacts('dist-1', {});
      expect(data[0].status).toBe('NOT_A_CUSTOMER');
    });

    it('filters the page by the requested status', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([
        row({ id: 'a', isArchived: true }),
        row({ id: 'b' }),
      ]);
      const { data } = await service.listContacts('dist-1', { status: 'ARCHIVED' });
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('a');
    });

    it('filters at the DB level by type=customers', async () => {
      await service.listContacts('dist-1', { type: 'customers' });
      expect(prisma.externalAccountingContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([expect.objectContaining({ isCustomer: true })]),
          }),
        }),
      );
    });

    it('filters at the DB level by type=suppliers', async () => {
      await service.listContacts('dist-1', { type: 'suppliers' });
      expect(prisma.externalAccountingContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([expect.objectContaining({ isSupplier: true })]),
          }),
        }),
      );
    });

    it('filters at the DB level by type=archived', async () => {
      await service.listContacts('dist-1', { type: 'archived' });
      expect(prisma.externalAccountingContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([expect.objectContaining({ isArchived: true })]),
          }),
        }),
      );
    });

    it('sets hasMore and a nextCursor when more rows exist than the limit', async () => {
      prisma.externalAccountingContact.findMany.mockResolvedValue([row({ id: 'a' }), row({ id: 'b' })]);
      const { pagination } = await service.listContacts('dist-1', { limit: 1 });
      expect(pagination.hasMore).toBe(true);
      expect(pagination.nextCursor).not.toBeNull();
    });
  });

  describe('countNeedsAttention', () => {
    it('returns 0 when there is no active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(service.countNeedsAttention('dist-1')).resolves.toBe(0);
    });

    it('sums suggested and ready-to-import counts', async () => {
      prisma.externalAccountingContact.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
      await expect(service.countNeedsAttention('dist-1')).resolves.toBe(5);
    });
  });

  describe('requestManualSync', () => {
    it('writes an AccountingContactSyncRequested outbox event rather than syncing inline', async () => {
      const result = await service.requestManualSync('dist-1');
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        'AccountingConnection',
        'conn-1',
        'AccountingContactSyncRequested',
        {},
      );
      expect(result).toEqual({ queued: true });
    });

    it('throws when there is no active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(service.requestManualSync('dist-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('importAsNewCustomer', () => {
    const cachedContact = {
      id: 'contact-1',
      displayName: 'Blackbird Vine & Co',
      externalContactCode: 'XC-1',
      externalAccountNumber: null,
      billingLine1: '1 Vine St',
      billingLine2: null,
      billingCity: 'London',
      billingState: null,
      billingPostcode: 'E1 1AA',
      billingCountry: 'UK',
    };

    beforeEach(() => {
      prisma.externalAccountingContact.findFirst.mockResolvedValue(cachedContact);
      adminCustomers.create.mockResolvedValue({ id: 'tr-1', organisationId: 'org-1' });
    });

    it('creates the customer via AdminCustomersService without ever passing an email', async () => {
      await service.importAsNewCustomer('dist-1', 'user-1', 'contact-1', {});

      expect(adminCustomers.create).toHaveBeenCalledWith(
        'dist-1',
        expect.objectContaining({ name: 'Blackbird Vine & Co', accountNumber: 'XC-1' }),
      );
      const dtoArg = adminCustomers.create.mock.calls[0][1];
      expect(dtoArg.email).toBeUndefined();
    });

    it('writes a CustomerAccountingMapping for the new relationship with MANUAL matchMethod', async () => {
      await service.importAsNewCustomer('dist-1', 'user-1', 'contact-1', {});

      expect(prisma.customerAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          tradeRelationshipId: 'tr-1',
          externalContactId: 'contact-1',
          matchMethod: AccountingContactMatchMethod.MANUAL,
          linkedByUserId: 'user-1',
        }),
      });
    });

    it('applies DTO overrides over the cached contact defaults', async () => {
      await service.importAsNewCustomer('dist-1', 'user-1', 'contact-1', { name: 'Renamed Co', accountNumber: 'OVERRIDE' });
      expect(adminCustomers.create).toHaveBeenCalledWith(
        'dist-1',
        expect.objectContaining({ name: 'Renamed Co', accountNumber: 'OVERRIDE' }),
      );
    });

    it('throws ConflictException when the contact is already mapped', async () => {
      prisma.customerAccountingMapping.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.importAsNewCustomer('dist-1', 'user-1', 'contact-1', {})).rejects.toThrow(ConflictException);
      expect(adminCustomers.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the contact does not exist on this connection', async () => {
      prisma.externalAccountingContact.findFirst.mockResolvedValue(null);
      await expect(service.importAsNewCustomer('dist-1', 'user-1', 'contact-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmSuggestion', () => {
    it('creates a mapping using the suggestion match method and marks it ACCEPTED', async () => {
      prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTradeRelationshipId: 'tr-1',
        externalContactId: 'contact-1',
        matchMethod: AccountingContactMatchMethod.ACCOUNT_CODE_EXACT,
      });

      await service.confirmSuggestion('dist-1', 'user-1', 'sugg-1');

      expect(prisma.customerAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tradeRelationshipId: 'tr-1',
          externalContactId: 'contact-1',
          matchMethod: AccountingContactMatchMethod.ACCOUNT_CODE_EXACT,
          linkedByUserId: 'user-1',
        }),
      });
      expect(prisma.accountingContactMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: expect.objectContaining({ status: 'ACCEPTED', reviewedByUserId: 'user-1' }),
      });
    });

    it('throws NotFoundException when the suggestion does not exist or was already resolved', async () => {
      prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue(null);
      await expect(service.confirmSuggestion('dist-1', 'user-1', 'sugg-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the target customer is already mapped to a different contact', async () => {
      prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedTradeRelationshipId: 'tr-1',
        externalContactId: 'contact-1',
        matchMethod: AccountingContactMatchMethod.NAME_EXACT,
      });
      prisma.customerAccountingMapping.findFirst.mockResolvedValue({ id: 'existing-mapping' });

      await expect(service.confirmSuggestion('dist-1', 'user-1', 'sugg-1')).rejects.toThrow(ConflictException);
      expect(prisma.customerAccountingMapping.create).not.toHaveBeenCalled();
    });
  });

  describe('matchToExistingCustomer', () => {
    beforeEach(() => {
      prisma.externalAccountingContact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.tradeRelationship.findFirst.mockResolvedValue({ id: 'tr-1', distributorId: 'dist-1' });
    });

    it('creates a MANUAL mapping and supersedes any pending suggestion', async () => {
      await service.matchToExistingCustomer('dist-1', 'user-1', 'contact-1', 'tr-1');

      expect(prisma.customerAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ matchMethod: AccountingContactMatchMethod.MANUAL, tradeRelationshipId: 'tr-1' }),
      });
      expect(prisma.accountingContactMatchSuggestion.updateMany).toHaveBeenCalledWith({
        where: { externalContactId: 'contact-1', status: 'SUGGESTED' },
        data: { status: 'SUPERSEDED' },
      });
    });

    it('throws NotFoundException when the target customer does not belong to this distributor', async () => {
      prisma.tradeRelationship.findFirst.mockResolvedValue(null);
      await expect(service.matchToExistingCustomer('dist-1', 'user-1', 'contact-1', 'tr-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the contact is already mapped', async () => {
      prisma.customerAccountingMapping.findFirst.mockResolvedValueOnce({ id: 'existing' });
      await expect(service.matchToExistingCustomer('dist-1', 'user-1', 'contact-1', 'tr-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('ignore', () => {
    it('sets ignoredAt and rejects any pending suggestion', async () => {
      prisma.externalAccountingContact.findFirst.mockResolvedValue({ id: 'contact-1' });

      await service.ignore('dist-1', 'user-1', 'contact-1');

      expect(prisma.externalAccountingContact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { ignoredAt: expect.any(Date) },
      });
      expect(prisma.accountingContactMatchSuggestion.updateMany).toHaveBeenCalledWith({
        where: { externalContactId: 'contact-1', status: 'SUGGESTED' },
        data: expect.objectContaining({ status: 'REJECTED', reviewedByUserId: 'user-1' }),
      });
    });

    it('throws NotFoundException when the contact does not exist', async () => {
      prisma.externalAccountingContact.findFirst.mockResolvedValue(null);
      await expect(service.ignore('dist-1', 'user-1', 'contact-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlink', () => {
    it('sets unlinkedAt on an active mapping', async () => {
      prisma.customerAccountingMapping.findFirst.mockResolvedValue({ id: 'mapping-1' });

      await service.unlink('dist-1', 'mapping-1');

      expect(prisma.customerAccountingMapping.update).toHaveBeenCalledWith({
        where: { id: 'mapping-1' },
        data: { unlinkedAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException when the mapping does not exist or is already unlinked', async () => {
      prisma.customerAccountingMapping.findFirst.mockResolvedValue(null);
      await expect(service.unlink('dist-1', 'mapping-1')).rejects.toThrow(NotFoundException);
    });
  });
});
