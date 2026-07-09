import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountingProductMatchMethod, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { AdminProductsService } from '../admin-products/admin-products.service';
import { AccountingProductService } from './accounting-product.service';

function makePrismaMock() {
  const prisma: any = {
    accountingConnection: { findFirst: jest.fn() },
    externalAccountingProduct: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    productAccountingMapping: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    accountingProductMatchSuggestion: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    product: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  prisma.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

const activeConnection = { id: 'conn-1', distributorId: 'dist-1', status: 'CONNECTED' };

describe('AccountingProductService', () => {
  let service: AccountingProductService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let outbox: { writeEvent: jest.Mock };
  let adminProducts: { create: jest.Mock };

  beforeEach(() => {
    prisma = makePrismaMock();
    prisma.accountingConnection.findFirst.mockResolvedValue(activeConnection);
    outbox = { writeEvent: jest.fn().mockResolvedValue({}) };
    adminProducts = { create: jest.fn().mockResolvedValue({ id: 'prod-new', name: 'Imported' }) };
    service = new AccountingProductService(
      prisma as unknown as PrismaService,
      outbox as unknown as OutboxService,
      adminProducts as unknown as AdminProductsService,
    );
  });

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ext-1',
      displayName: 'Cabernet Sauvignon 2023',
      description: 'A bold red',
      externalProductCode: 'CAB-SAUV-001',
      salesUnitPrice: new Prisma.Decimal('12.3456'),
      quantityOnHand: null,
      isSold: true,
      isPurchased: true,
      isTracked: false,
      isActive: true,
      ignoredAt: null,
      mappings: [],
      suggestions: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  describe('listProducts', () => {
    it('throws NotFoundException when the distributor has no active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(service.listProducts('dist-1', {})).rejects.toThrow(NotFoundException);
    });

    it('computes LINKED for a product with an active mapping', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([
        row({
          mappings: [
            { id: 'map-1', productId: 'prod-1', matchMethod: 'MANUAL', linkedAt: new Date(), product: { id: 'prod-1', name: 'Cab Sauv' } },
          ],
        }),
      ]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].status).toBe('LINKED');
      expect(data[0].mapping?.productName).toBe('Cab Sauv');
    });

    it('computes SUGGESTED for a product with a pending suggestion', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([
        row({
          suggestions: [
            {
              id: 'sugg-1',
              suggestedProductId: 'prod-1',
              confidence: 95,
              matchMethod: 'SKU_EXACT',
              matchReason: 'Item code matches',
              suggestedProduct: { id: 'prod-1', name: 'Cab Sauv' },
            },
          ],
        }),
      ]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].status).toBe('SUGGESTED');
      expect(data[0].suggestion?.confidence).toBe(95);
    });

    it('computes CONFLICT when the suggested product appears in more than one active suggestion', async () => {
      prisma.accountingProductMatchSuggestion.groupBy.mockResolvedValue([
        { suggestedProductId: 'prod-shared', _count: { _all: 2 } },
      ]);
      prisma.externalAccountingProduct.findMany.mockResolvedValue([
        row({
          suggestions: [
            {
              id: 'sugg-1',
              suggestedProductId: 'prod-shared',
              confidence: 65,
              matchMethod: 'NAME_EXACT',
              matchReason: 'Name matches',
              suggestedProduct: { id: 'prod-shared', name: 'Cab Sauv' },
            },
          ],
        }),
      ]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].status).toBe('CONFLICT');
    });

    it('computes IGNORED for an ignored product', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([row({ ignoredAt: new Date() })]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].status).toBe('IGNORED');
    });

    it('computes INACTIVE for a product that vanished from the provider fetch', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([row({ isActive: false })]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].status).toBe('INACTIVE');
    });

    it('computes NOT_SOLD for a purchase-only item', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([row({ isSold: false })]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].status).toBe('NOT_SOLD');
    });

    it('computes READY_TO_IMPORT for an unmapped, unsuggested, active, sold item', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([row()]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].status).toBe('READY_TO_IMPORT');
    });

    it('serialises decimal prices as strings', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([
        row({ quantityOnHand: new Prisma.Decimal('42.5') }),
      ]);
      const { data } = await service.listProducts('dist-1', {});
      expect(data[0].salesUnitPrice).toBe('12.3456');
      expect(data[0].quantityOnHand).toBe('42.5');
    });

    it('applies the status filter to the fetched page', async () => {
      prisma.externalAccountingProduct.findMany.mockResolvedValue([
        row({ id: 'ext-1' }),
        row({ id: 'ext-2', ignoredAt: new Date() }),
      ]);
      const { data } = await service.listProducts('dist-1', { status: 'IGNORED' });
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('ext-2');
    });

    it('applies the provider type filter at the DB level', async () => {
      await service.listProducts('dist-1', { type: 'tracked' });
      const where = prisma.externalAccountingProduct.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toMatchObject({ isTracked: true });
    });
  });

  describe('countNeedsAttention', () => {
    it('returns 0 when there is no active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      expect(await service.countNeedsAttention('dist-1')).toBe(0);
    });

    it('sums suggested and ready-to-import counts', async () => {
      prisma.externalAccountingProduct.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
      expect(await service.countNeedsAttention('dist-1')).toBe(5);
    });
  });

  describe('requestManualSync', () => {
    it('writes an AccountingProductSyncRequested outbox event for the active connection', async () => {
      const result = await service.requestManualSync('dist-1');

      expect(outbox.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        'AccountingConnection',
        'conn-1',
        'AccountingProductSyncRequested',
        {},
      );
      expect(result).toEqual({ queued: true });
    });

    it('throws NotFoundException without an active connection', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      await expect(service.requestManualSync('dist-1')).rejects.toThrow(NotFoundException);
      expect(outbox.writeEvent).not.toHaveBeenCalled();
    });
  });

  describe('importAsNewProduct', () => {
    beforeEach(() => {
      prisma.externalAccountingProduct.findFirst.mockResolvedValue(row());
    });

    it('creates a DRAFT product seeded from the cache row and links it with a MANUAL mapping', async () => {
      const result = await service.importAsNewProduct('dist-1', 'user-1', 'ext-1', {});

      expect(adminProducts.create).toHaveBeenCalledWith('dist-1', {
        name: 'Cabernet Sauvignon 2023',
        description: 'A bold red',
        sku: 'CAB-SAUV-001',
        status: ProductStatus.DRAFT,
        productTypeId: undefined,
        supplierId: undefined,
        // 4-dp cache price rounded to the 2-dp Product.price at import
        price: '12.35',
      });
      expect(prisma.productAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributorId: 'dist-1',
          accountingConnectionId: 'conn-1',
          productId: 'prod-new',
          externalProductId: 'ext-1',
          matchMethod: AccountingProductMatchMethod.MANUAL,
          linkedByUserId: 'user-1',
        }),
      });
      expect(result).toEqual({ id: 'prod-new', name: 'Imported' });
    });

    it('lets explicit overrides win over cache defaults', async () => {
      await service.importAsNewProduct('dist-1', 'user-1', 'ext-1', {
        name: 'House Cab',
        sku: 'HOUSE-CAB',
        price: '10.00',
      });

      expect(adminProducts.create).toHaveBeenCalledWith(
        'dist-1',
        expect.objectContaining({ name: 'House Cab', sku: 'HOUSE-CAB', price: '10.00' }),
      );
    });

    it('omits the price when the cache row has no sales price', async () => {
      prisma.externalAccountingProduct.findFirst.mockResolvedValue(row({ salesUnitPrice: null }));

      await service.importAsNewProduct('dist-1', 'user-1', 'ext-1', {});

      expect(adminProducts.create).toHaveBeenCalledWith('dist-1', expect.objectContaining({ price: undefined }));
    });

    it('409s when the SKU collides with an existing product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-existing', deletedAt: null });

      await expect(service.importAsNewProduct('dist-1', 'user-1', 'ext-1', {})).rejects.toThrow(ConflictException);
      expect(adminProducts.create).not.toHaveBeenCalled();
    });

    it('409s with a restore hint when the SKU collides with a soft-deleted product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-deleted', deletedAt: new Date() });

      await expect(service.importAsNewProduct('dist-1', 'user-1', 'ext-1', {})).rejects.toThrow(/deleted product/);
    });

    it('409s when the accounting product is already mapped', async () => {
      prisma.productAccountingMapping.findFirst.mockResolvedValue({ id: 'mapping-existing' });

      await expect(service.importAsNewProduct('dist-1', 'user-1', 'ext-1', {})).rejects.toThrow(ConflictException);
      expect(adminProducts.create).not.toHaveBeenCalled();
    });

    it('404s when the accounting product does not exist on the active connection', async () => {
      prisma.externalAccountingProduct.findFirst.mockResolvedValue(null);

      await expect(service.importAsNewProduct('dist-1', 'user-1', 'missing', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmSuggestion', () => {
    it('creates the mapping with the suggestion match method and marks the suggestion ACCEPTED', async () => {
      prisma.accountingProductMatchSuggestion.findFirst.mockResolvedValue({
        id: 'sugg-1',
        suggestedProductId: 'prod-1',
        externalProductId: 'ext-1',
        matchMethod: AccountingProductMatchMethod.SKU_EXACT,
      });

      await service.confirmSuggestion('dist-1', 'user-1', 'sugg-1');

      expect(prisma.productAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          externalProductId: 'ext-1',
          matchMethod: AccountingProductMatchMethod.SKU_EXACT,
          linkedByUserId: 'user-1',
        }),
      });
      expect(prisma.accountingProductMatchSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sugg-1' },
        data: expect.objectContaining({ status: 'ACCEPTED', reviewedByUserId: 'user-1' }),
      });
    });

    it('404s when the suggestion does not exist or is already resolved', async () => {
      prisma.accountingProductMatchSuggestion.findFirst.mockResolvedValue(null);
      await expect(service.confirmSuggestion('dist-1', 'user-1', 'sugg-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('matchToExistingProduct', () => {
    beforeEach(() => {
      prisma.externalAccountingProduct.findFirst.mockResolvedValue(row());
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', distributorId: 'dist-1' });
    });

    it('creates a MANUAL mapping and supersedes any open suggestions for the contact', async () => {
      await service.matchToExistingProduct('dist-1', 'user-1', 'ext-1', 'prod-1');

      expect(prisma.productAccountingMapping.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          externalProductId: 'ext-1',
          matchMethod: AccountingProductMatchMethod.MANUAL,
        }),
      });
      expect(prisma.accountingProductMatchSuggestion.updateMany).toHaveBeenCalledWith({
        where: { externalProductId: 'ext-1', status: 'SUGGESTED' },
        data: { status: 'SUPERSEDED' },
      });
    });

    it('404s when the Wholo product does not belong to the distributor', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.matchToExistingProduct('dist-1', 'user-1', 'ext-1', 'prod-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409s when the Wholo product is already linked to a different accounting product', async () => {
      // First findFirst call: external-product-not-mapped check (null); the
      // product-side check then finds an existing active mapping.
      prisma.productAccountingMapping.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'mapping-existing' });

      await expect(service.matchToExistingProduct('dist-1', 'user-1', 'ext-1', 'prod-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('ignore', () => {
    it('sets ignoredAt and rejects open suggestions', async () => {
      prisma.externalAccountingProduct.findFirst.mockResolvedValue(row());

      await service.ignore('dist-1', 'user-1', 'ext-1');

      expect(prisma.externalAccountingProduct.update).toHaveBeenCalledWith({
        where: { id: 'ext-1' },
        data: { ignoredAt: expect.any(Date) },
      });
      expect(prisma.accountingProductMatchSuggestion.updateMany).toHaveBeenCalledWith({
        where: { externalProductId: 'ext-1', status: 'SUGGESTED' },
        data: expect.objectContaining({ status: 'REJECTED', reviewedByUserId: 'user-1' }),
      });
    });
  });

  describe('unlink', () => {
    it('soft-unlinks an active mapping', async () => {
      prisma.productAccountingMapping.findFirst.mockResolvedValue({ id: 'mapping-1' });

      await service.unlink('dist-1', 'mapping-1');

      expect(prisma.productAccountingMapping.update).toHaveBeenCalledWith({
        where: { id: 'mapping-1' },
        data: { unlinkedAt: expect.any(Date) },
      });
    });

    it('404s when the mapping does not exist or is already unlinked', async () => {
      prisma.productAccountingMapping.findFirst.mockResolvedValue(null);
      await expect(service.unlink('dist-1', 'mapping-x')).rejects.toThrow(NotFoundException);
    });
  });
});
