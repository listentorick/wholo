import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrganisationType, ProductStatus } from '@prisma/client';
import { CatalogueService } from './catalogue.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceResolutionService } from '../price-lists/price-resolution.service';
import { R2StorageService } from '../asset-images/r2-storage.service';

const DISTRIBUTOR_ID = 'dist-1';
const DISTRIBUTOR_SLUG = 'test-dist';
const PRODUCT_ID_1 = 'prod-1';
const PRODUCT_ID_2 = 'prod-2';
const NOW = new Date('2025-01-15T00:00:00Z');

const baseDistributor = {
  id: DISTRIBUTOR_ID,
  name: 'Test Distributor',
};

const makeProduct = (id: string) => ({
  id,
  distributorId: DISTRIBUTOR_ID,
  name: `Product ${id}`,
  description: null,
  sku: `SKU-${id}`,
  status: ProductStatus.ACTIVE,
  price: null,
  compareAtPrice: null,
  productTypeId: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  productType: null,
});

const mockPrisma = {
  organisation: { findFirst: jest.fn() },
  tradeRelationship: { findFirst: jest.fn() },
  customerCatalogue: { findMany: jest.fn() },
  product: { findMany: jest.fn(), count: jest.fn() },
  priceListRule: { findMany: jest.fn() },
  assetImage: { findMany: jest.fn() },
};

const mockPriceResolution = {
  resolvePriceListId: jest.fn(),
  resolvePrice: jest.fn(),
};

const mockR2Storage = {
  getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
};

describe('CatalogueService', () => {
  let service: CatalogueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PriceResolutionService, useValue: mockPriceResolution },
        { provide: R2StorageService, useValue: mockR2Storage },
      ],
    }).compile();

    service = module.get<CatalogueService>(CatalogueService);
    jest.clearAllMocks();

    mockPrisma.organisation.findFirst.mockResolvedValue(baseDistributor);
    mockPrisma.product.count.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.assetImage.findMany.mockResolvedValue([]);
  });

  describe('getDistributor', () => {
    it('returns distributor when found', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue({ ...baseDistributor, slug: DISTRIBUTOR_SLUG });
      const result = await service.getDistributor(DISTRIBUTOR_SLUG);
      expect(result.id).toBe(DISTRIBUTOR_ID);
    });

    it('throws NotFoundException when distributor does not exist', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(null);
      await expect(service.getDistributor('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProducts', () => {
    it('throws NotFoundException when distributor does not exist', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(null);
      await expect(service.getProducts('unknown', {})).rejects.toThrow(NotFoundException);
    });

    it('returns products with null thumbnailUrl when no images exist', async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct(PRODUCT_ID_1)]);
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.assetImage.findMany.mockResolvedValue([]);

      const result = await service.getProducts(DISTRIBUTOR_SLUG, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].thumbnailUrl).toBeNull();
    });

    it('returns thumbnailUrl from thumb variant of primary image', async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct(PRODUCT_ID_1)]);
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.assetImage.findMany.mockResolvedValue([
        {
          entityId: PRODUCT_ID_1,
          variants: { thumb: 'distributors/dist-1/products/prod-1/images/img-1/thumb.webp', catalogue: 'distributors/dist-1/products/prod-1/images/img-1/catalogue.webp' },
        },
      ]);

      const result = await service.getProducts(DISTRIBUTOR_SLUG, {});

      expect(result.data[0].thumbnailUrl).toBe('https://cdn.example.com/distributors/dist-1/products/prod-1/images/img-1/thumb.webp');
    });

    it('returns null thumbnailUrl when image exists but has no thumb variant', async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct(PRODUCT_ID_1)]);
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.assetImage.findMany.mockResolvedValue([
        {
          entityId: PRODUCT_ID_1,
          variants: { large: 'https://cdn.example.com/large.webp' },
        },
      ]);

      const result = await service.getProducts(DISTRIBUTOR_SLUG, {});

      expect(result.data[0].thumbnailUrl).toBeNull();
    });

    it('queries assetImage with correct distributorId for multi-tenancy', async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct(PRODUCT_ID_1)]);
      mockPrisma.product.count.mockResolvedValue(1);

      await service.getProducts(DISTRIBUTOR_SLUG, {});

      expect(mockPrisma.assetImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ distributorId: DISTRIBUTOR_ID }),
        }),
      );
    });

    it('queries assetImage only for product-image assetType', async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct(PRODUCT_ID_1)]);
      mockPrisma.product.count.mockResolvedValue(1);

      await service.getProducts(DISTRIBUTOR_SLUG, {});

      expect(mockPrisma.assetImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assetType: 'product-image', isPrimary: true }),
        }),
      );
    });

    it('skips assetImage query when product page is empty', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.getProducts(DISTRIBUTOR_SLUG, {});

      expect(mockPrisma.assetImage.findMany).not.toHaveBeenCalled();
    });

    it('correctly maps thumbnails to each product without cross-contamination', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        makeProduct(PRODUCT_ID_1),
        makeProduct(PRODUCT_ID_2),
      ]);
      mockPrisma.product.count.mockResolvedValue(2);
      mockPrisma.assetImage.findMany.mockResolvedValue([
        { entityId: PRODUCT_ID_1, variants: { thumb: 'dist/prod-1/thumb.webp' } },
        { entityId: PRODUCT_ID_2, variants: { thumb: 'dist/prod-2/thumb.webp' } },
      ]);

      const result = await service.getProducts(DISTRIBUTOR_SLUG, {});

      const prod1 = result.data.find((p) => p.id === PRODUCT_ID_1);
      const prod2 = result.data.find((p) => p.id === PRODUCT_ID_2);
      expect(prod1?.thumbnailUrl).toBe('https://cdn.example.com/dist/prod-1/thumb.webp');
      expect(prod2?.thumbnailUrl).toBe('https://cdn.example.com/dist/prod-2/thumb.webp');
    });

    it('returns pagination metadata', async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct(PRODUCT_ID_1)]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.getProducts(DISTRIBUTOR_SLUG, {});

      expect(result.pagination.total).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
    });

    it('sets hasMore and nextCursor when there are more results', async () => {
      const products = Array.from({ length: 51 }, (_, i) => makeProduct(`prod-${i}`));
      mockPrisma.product.findMany.mockResolvedValue(products);
      mockPrisma.product.count.mockResolvedValue(100);

      const result = await service.getProducts(DISTRIBUTOR_SLUG, { limit: 50 });

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).not.toBeNull();
      expect(result.data).toHaveLength(50);
    });
  });
});
