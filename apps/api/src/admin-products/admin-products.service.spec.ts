import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminProductsService } from './admin-products.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductSearchService } from '../product-search/product-search.service';

const mockPrisma = {
  product: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  // Interactive transactions run the callback against the same mock client
  $transaction: jest.fn((fn: (tx: unknown) => unknown): unknown => fn(mockPrisma)),
};

const mockProductSearch = {
  indexProduct: jest.fn(),
  removeProduct: jest.fn(),
};

const DISTRIBUTOR_ID = 'dist-1';
const PRODUCT_ID = 'prod-1';
const NOW = new Date('2025-01-15T00:00:00Z');

const baseProduct = {
  id: PRODUCT_ID,
  distributorId: DISTRIBUTOR_ID,
  name: 'Test Product',
  description: null,
  sku: 'SKU-1',
  status: 'ACTIVE',
  price: null,
  compareAtPrice: null,
  productTypeId: null,
  supplierId: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  productType: null,
  supplier: null,
};

describe('AdminProductsService', () => {
  let service: AdminProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProductSearchService, useValue: mockProductSearch },
      ],
    }).compile();

    service = module.get<AdminProductsService>(AdminProductsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated list with no cursor', async () => {
      mockPrisma.product.findMany.mockResolvedValue([baseProduct]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.findAll(DISTRIBUTOR_ID, {});

      expect(result.data).toEqual([baseProduct]);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.total).toBe(1);
    });

    it('sets hasMore and nextCursor when result exceeds limit', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        ...baseProduct,
        id: `prod-${i}`,
        createdAt: new Date(NOW.getTime() - i * 1000),
      }));
      mockPrisma.product.findMany.mockResolvedValue(items);
      mockPrisma.product.count.mockResolvedValue(25);

      const result = await service.findAll(DISTRIBUTOR_ID, { limit: 20 });

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).not.toBeNull();
      expect(result.data).toHaveLength(20);
    });

    it('passes cursor where clause when valid cursor provided', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: NOW.toISOString(), id: PRODUCT_ID }),
      ).toString('base64url');
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll(DISTRIBUTOR_ID, { cursor });

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where.AND[1]).toHaveProperty('OR');
    });

    it('throws BadRequestException on malformed cursor', async () => {
      const badCursor = Buffer.from('not-valid-json').toString('base64url') + '!!!';
      await expect(service.findAll(DISTRIBUTOR_ID, { cursor: badCursor })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('applies a single-value status filter as an IN clause', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll(DISTRIBUTOR_ID, { status: ['ACTIVE'] as any });

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where.AND[0].status).toEqual({ in: ['ACTIVE'] });
    });

    it('applies a multi-value status filter matching any of the given statuses', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll(DISTRIBUTOR_ID, { status: ['ACTIVE', 'DRAFT'] as any });

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where.AND[0].status).toEqual({ in: ['ACTIVE', 'DRAFT'] });
    });

    it('applies productTypeId and supplierId filters as IN clauses', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll(DISTRIBUTOR_ID, {
        productTypeId: ['pt-1', 'pt-2'],
        supplierId: ['sup-1'],
      });

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where.AND[0].productTypeId).toEqual({ in: ['pt-1', 'pt-2'] });
      expect(call.where.AND[0].supplierId).toEqual({ in: ['sup-1'] });
    });

    it('adds no status/productTypeId/supplierId constraints when filters are empty or absent', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll(DISTRIBUTOR_ID, { status: [], productTypeId: [], supplierId: [] } as any);

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ distributorId: DISTRIBUTOR_ID, deletedAt: null });
    });

    it('scopes query to the requesting distributor only', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll(DISTRIBUTOR_ID, {});

      const findManyCall = mockPrisma.product.findMany.mock.calls[0][0];
      const countCall = mockPrisma.product.count.mock.calls[0][0];
      expect(findManyCall.where.AND[0].distributorId).toBe(DISTRIBUTOR_ID);
      expect(countCall.where.distributorId).toBe(DISTRIBUTOR_ID);
    });
  });

  describe('findOne', () => {
    it('returns product when found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(baseProduct);

      const result = await service.findOne(PRODUCT_ID, DISTRIBUTOR_ID);

      expect(result).toEqual(baseProduct);
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PRODUCT_ID, distributorId: DISTRIBUTOR_ID, deletedAt: null } }),
      );
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.findOne(PRODUCT_ID, DISTRIBUTOR_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when product belongs to a different distributor', async () => {
      // findFirst returns null because distributorId is part of the where clause —
      // a product owned by another distributor is invisible, not forbidden
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.findOne(PRODUCT_ID, 'other-dist')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PRODUCT_ID, distributorId: 'other-dist', deletedAt: null } }),
      );
    });
  });

  describe('create', () => {
    it('creates product with correct distributor and fields', async () => {
      const dto = { name: 'New Product', sku: 'SKU-NEW' };
      const created = { ...baseProduct, name: 'New Product', sku: 'SKU-NEW' };
      mockPrisma.product.create.mockResolvedValue(created);

      const result = await service.create(DISTRIBUTOR_ID, dto as any);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ distributorId: DISTRIBUTOR_ID, name: 'New Product' }),
        }),
      );
      expect(result).toEqual(created);
    });

    it('defaults status to DRAFT when not provided', async () => {
      mockPrisma.product.create.mockResolvedValue(baseProduct);

      await service.create(DISTRIBUTOR_ID, { name: 'Draft Product' } as any);

      const call = mockPrisma.product.create.mock.calls[0][0];
      expect(call.data.status).toBe('DRAFT');
    });

    it('indexes the search document for the created product', async () => {
      mockPrisma.product.create.mockResolvedValue(baseProduct);

      await service.create(DISTRIBUTOR_ID, { name: 'Test Product' } as any);

      expect(mockProductSearch.indexProduct).toHaveBeenCalledWith(baseProduct, mockPrisma);
    });
  });

  describe('update', () => {
    it('updates product when found and owned by distributor', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID, deletedAt: null });
      const updated = { ...baseProduct, name: 'Updated' };
      mockPrisma.product.update.mockResolvedValue(updated);

      const result = await service.update(PRODUCT_ID, DISTRIBUTOR_ID, { name: 'Updated' });

      expect(mockPrisma.product.update).toHaveBeenCalled();
      expect(result.name).toBe('Updated');
    });

    it('re-indexes the search document with the updated product', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID, deletedAt: null });
      const updated = { ...baseProduct, name: 'Updated' };
      mockPrisma.product.update.mockResolvedValue(updated);

      await service.update(PRODUCT_ID, DISTRIBUTOR_ID, { name: 'Updated' });

      expect(mockProductSearch.indexProduct).toHaveBeenCalledWith(updated, mockPrisma);
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.update(PRODUCT_ID, DISTRIBUTOR_ID, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when product is soft-deleted', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID, deletedAt: NOW });

      await expect(service.update(PRODUCT_ID, DISTRIBUTOR_ID, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when product belongs to different distributor', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ distributorId: 'other-dist', deletedAt: null });

      await expect(service.update(PRODUCT_ID, DISTRIBUTOR_ID, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes product by setting deletedAt', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID, deletedAt: null });
      mockPrisma.product.update.mockResolvedValue(baseProduct);

      await service.remove(PRODUCT_ID, DISTRIBUTOR_ID);

      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PRODUCT_ID },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('removes the search document for the soft-deleted product', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ distributorId: DISTRIBUTOR_ID, deletedAt: null });
      mockPrisma.product.update.mockResolvedValue(baseProduct);

      await service.remove(PRODUCT_ID, DISTRIBUTOR_ID);

      expect(mockProductSearch.removeProduct).toHaveBeenCalledWith(PRODUCT_ID, mockPrisma);
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.remove(PRODUCT_ID, DISTRIBUTOR_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when product belongs to different distributor', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ distributorId: 'other-dist', deletedAt: null });

      await expect(service.remove(PRODUCT_ID, DISTRIBUTOR_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});
