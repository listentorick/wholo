import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { AccountingRecordLinkService } from './accounting-record-link.service';

const connection = {
  id: 'conn-1',
  distributorId: 'dist-1',
  accountingOrganisationId: 'org-acc-1',
  provider: 'FAKE',
  status: 'CONNECTED',
  lastSyncedAt: new Date('2026-10-27T10:42:00Z'),
};

const contact = (overrides: Record<string, unknown> = {}) => ({
  id: 'ext-c-1',
  displayName: 'Highfield Golf Club Ltd',
  externalContactCode: null,
  externalAccountNumber: 'HGC-01',
  email: 'bar@highfield.example',
  changeDetectedAt: null,
  changeAcknowledgedAt: null,
  ...overrides,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'ext-p-1',
  displayName: 'Sparkling Grape Juice 75cl',
  externalProductCode: 'NA-008',
  salesUnitPrice: new Prisma.Decimal('3.2'),
  taxCode: 'T20',
  changeDetectedAt: null,
  changeAcknowledgedAt: null,
  ...overrides,
});

describe('AccountingRecordLinkService', () => {
  let service: AccountingRecordLinkService;
  const prisma = {
    tradeRelationship: { findFirst: jest.fn() },
    product: { findFirst: jest.fn() },
    customerAccountingMapping: { findMany: jest.fn() },
    productAccountingMapping: { findMany: jest.fn() },
    accountingContactMatchSuggestion: { findFirst: jest.fn() },
    accountingProductMatchSuggestion: { findFirst: jest.fn() },
    externalAccountingTaxType: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const connections = { getCurrentConnection: jest.fn() };
  const adapters = { displayName: jest.fn().mockReturnValue('Fake Books') };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.tradeRelationship.findFirst.mockResolvedValue({ id: 'rel-1' });
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
    prisma.customerAccountingMapping.findMany.mockResolvedValue([]);
    prisma.productAccountingMapping.findMany.mockResolvedValue([]);
    prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue(null);
    prisma.accountingProductMatchSuggestion.findFirst.mockResolvedValue(null);
    prisma.externalAccountingTaxType.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1', firstName: 'James', lastName: 'Vine' }]);
    connections.getCurrentConnection.mockResolvedValue(connection);

    const module = await Test.createTestingModule({
      providers: [
        AccountingRecordLinkService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingConnectionService, useValue: connections },
        { provide: AccountingAdapterRegistry, useValue: adapters },
      ],
    }).compile();
    service = module.get(AccountingRecordLinkService);
  });

  describe('getCustomerLink', () => {
    it('throws NotFound when the customer has no relationship with this distributor', async () => {
      prisma.tradeRelationship.findFirst.mockResolvedValue(null);
      await expect(service.getCustomerLink('dist-1', 'cust-other')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an empty link when there is no accounting connection', async () => {
      connections.getCurrentConnection.mockResolvedValue(null);
      expect(await service.getCustomerLink('dist-1', 'cust-1')).toEqual({
        connection: null,
        link: null,
        change: null,
        suggestion: null,
        history: [],
      });
    });

    it('names the provider through the adapter registry', async () => {
      const result = await service.getCustomerLink('dist-1', 'cust-1');
      expect(result.connection).toEqual({
        provider: 'FAKE',
        providerName: 'Fake Books',
        status: 'CONNECTED',
        lastSyncedAt: '2026-10-27T10:42:00.000Z',
      });
    });

    it('returns the linked contact, who linked it, and the full history', async () => {
      prisma.customerAccountingMapping.findMany.mockResolvedValue([
        {
          id: 'map-2',
          matchMethod: 'ACCOUNT_CODE_EXACT',
          linkedByUserId: 'user-1',
          linkedAt: new Date('2026-10-12T09:00:00Z'),
          unlinkedAt: null,
          externalContact: contact(),
        },
        {
          id: 'map-1',
          matchMethod: 'MANUAL',
          linkedByUserId: 'user-gone',
          linkedAt: new Date('2026-09-02T09:00:00Z'),
          unlinkedAt: new Date('2026-10-01T09:00:00Z'),
          externalContact: contact({ id: 'ext-c-0', displayName: 'Highfield GC (old)' }),
        },
      ]);

      const result = await service.getCustomerLink('dist-1', 'cust-1');

      expect(result.link).toEqual({
        mappingId: 'map-2',
        matchMethod: 'ACCOUNT_CODE_EXACT',
        linkedAt: '2026-10-12T09:00:00.000Z',
        linkedBy: { name: 'James Vine' },
        external: { id: 'ext-c-1', displayName: 'Highfield Golf Club Ltd', code: 'HGC-01', email: 'bar@highfield.example' },
      });
      expect(result.history).toEqual([
        {
          externalDisplayName: 'Highfield Golf Club Ltd',
          matchMethod: 'ACCOUNT_CODE_EXACT',
          linkedAt: '2026-10-12T09:00:00.000Z',
          linkedBy: { name: 'James Vine' },
          unlinkedAt: null,
        },
        {
          externalDisplayName: 'Highfield GC (old)',
          matchMethod: 'MANUAL',
          linkedAt: '2026-09-02T09:00:00.000Z',
          linkedBy: null,
          unlinkedAt: '2026-10-01T09:00:00.000Z',
        },
      ]);
      expect(result.suggestion).toBeNull();
      expect(result.change).toBeNull();
    });

    it('prefers the contact code over the account number', async () => {
      prisma.customerAccountingMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          matchMethod: 'MANUAL',
          linkedByUserId: 'user-1',
          linkedAt: new Date(),
          unlinkedAt: null,
          externalContact: contact({ externalContactCode: 'C-1' }),
        },
      ]);
      expect((await service.getCustomerLink('dist-1', 'cust-1')).link?.external.code).toBe('C-1');
    });

    it('reports an unacknowledged change on the linked contact', async () => {
      prisma.customerAccountingMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          matchMethod: 'MANUAL',
          linkedByUserId: 'user-1',
          linkedAt: new Date(),
          unlinkedAt: null,
          externalContact: contact({
            changeDetectedAt: new Date('2026-10-24T08:00:00Z'),
            changeAcknowledgedAt: new Date('2026-10-20T08:00:00Z'),
          }),
        },
      ]);
      expect((await service.getCustomerLink('dist-1', 'cust-1')).change).toEqual({ detectedAt: '2026-10-24T08:00:00.000Z' });
    });

    it('reports no change once the change has been acknowledged', async () => {
      prisma.customerAccountingMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          matchMethod: 'MANUAL',
          linkedByUserId: 'user-1',
          linkedAt: new Date(),
          unlinkedAt: null,
          externalContact: contact({
            changeDetectedAt: new Date('2026-10-24T08:00:00Z'),
            changeAcknowledgedAt: new Date('2026-10-25T08:00:00Z'),
          }),
        },
      ]);
      expect((await service.getCustomerLink('dist-1', 'cust-1')).change).toBeNull();
    });

    it('returns the open suggestion when the customer is not linked', async () => {
      prisma.accountingContactMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sug-1',
        confidence: 95,
        matchMethod: 'EMAIL_EXACT',
        matchReason: 'Same email address',
        externalContact: contact(),
      });

      const result = await service.getCustomerLink('dist-1', 'cust-1');

      expect(result.link).toBeNull();
      expect(result.suggestion).toEqual({
        id: 'sug-1',
        confidence: 95,
        matchMethod: 'EMAIL_EXACT',
        matchReason: 'Same email address',
        external: { id: 'ext-c-1', displayName: 'Highfield Golf Club Ltd', code: 'HGC-01', email: 'bar@highfield.example' },
      });
    });
  });

  describe('getProductLink', () => {
    it('throws NotFound for a product outside this distributor', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.getProductLink('dist-1', 'prod-other')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an empty link when there is no accounting connection', async () => {
      connections.getCurrentConnection.mockResolvedValue(null);
      expect((await service.getProductLink('dist-1', 'prod-1')).connection).toBeNull();
    });

    it("returns the linked item with the provider's name for its tax code", async () => {
      prisma.productAccountingMapping.findMany.mockResolvedValue([
        {
          id: 'map-p-1',
          matchMethod: 'SKU_EXACT',
          linkedByUserId: 'user-1',
          linkedAt: new Date('2026-10-03T09:00:00Z'),
          unlinkedAt: null,
          externalProduct: item(),
        },
      ]);
      prisma.externalAccountingTaxType.findMany.mockResolvedValue([{ taxType: 'T20', displayName: '20% (VAT on Income)' }]);

      const result = await service.getProductLink('dist-1', 'prod-1');

      expect(result.link?.external).toEqual({
        id: 'ext-p-1',
        displayName: 'Sparkling Grape Juice 75cl',
        code: 'NA-008',
        salesUnitPrice: '3.2',
        taxCode: 'T20',
        taxName: '20% (VAT on Income)',
      });
    });

    it('leaves taxName empty when the tax code is not in the cache', async () => {
      prisma.productAccountingMapping.findMany.mockResolvedValue([
        {
          id: 'map-p-1',
          matchMethod: 'SKU_EXACT',
          linkedByUserId: 'user-1',
          linkedAt: new Date(),
          unlinkedAt: null,
          externalProduct: item({ taxCode: 'UNKNOWN' }),
        },
      ]);
      expect((await service.getProductLink('dist-1', 'prod-1')).link?.external.taxName).toBeNull();
    });

    it('returns the open suggestion when the product is not linked', async () => {
      prisma.accountingProductMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sug-p-1',
        confidence: 100,
        matchMethod: 'SKU_EXACT',
        matchReason: 'Same SKU',
        externalProduct: item({ taxCode: null, salesUnitPrice: null }),
      });

      const result = await service.getProductLink('dist-1', 'prod-1');

      expect(result.suggestion?.external).toEqual({
        id: 'ext-p-1',
        displayName: 'Sparkling Grape Juice 75cl',
        code: 'NA-008',
        salesUnitPrice: null,
        taxCode: null,
        taxName: null,
      });
    });
  });
});
