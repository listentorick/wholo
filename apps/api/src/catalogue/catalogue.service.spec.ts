import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrganisationType, PriceListRuleSelectorType, PriceListRuleValueType, ProductStatus } from '@prisma/client';
import { CatalogueService } from './catalogue.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceResolutionService } from '../price-lists/price-resolution.service';
import { R2StorageService } from '../asset-images/r2-storage.service';

const DISTRIBUTOR_ID = 'dist-1';
const DISTRIBUTOR_SLUG = 'test-dist';
const PRODUCT_ID_1 = 'prod-1';
const PRODUCT_ID_2 = 'prod-2';
const CUSTOMER_ORG_ID = 'cust-1';
const RELATIONSHIP_ID = 'rel-1';
const NOW = new Date('2025-01-15T00:00:00Z');

interface DecimalLike {
  toFixed: (d: number) => string;
  div: (d: number) => DecimalLike;
  mul: (other: DecimalLike) => DecimalLike;
  minus: (other: DecimalLike) => DecimalLike;
}

const makeDecimal = (value: string): DecimalLike => ({
  toFixed: (d: number) => parseFloat(value).toFixed(d),
  div: (d: number) => makeDecimal((parseFloat(value) / d).toString()),
  mul: (other: DecimalLike) => makeDecimal((parseFloat(value) * parseFloat(other.toFixed(10))).toString()),
  minus: (other: DecimalLike) => makeDecimal((parseFloat(value) - parseFloat(other.toFixed(10))).toString()),
});

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
  product: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  priceListRule: { findMany: jest.fn() },
  assetImage: { findFirst: jest.fn(), findMany: jest.fn() },
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
    mockPrisma.product.findFirst.mockResolvedValue(makeProduct(PRODUCT_ID_1));
    mockPrisma.assetImage.findMany.mockResolvedValue([]);
    mockPrisma.assetImage.findFirst.mockResolvedValue(null);
    mockPrisma.tradeRelationship.findFirst.mockResolvedValue(null);
    mockPrisma.customerCatalogue.findMany.mockResolvedValue([]);
    mockPrisma.priceListRule.findMany.mockResolvedValue([]);
    mockPriceResolution.resolvePriceListId.mockResolvedValue(null);
  });

  describe('getDistributor', () => {
    it('returns distributor when found with null branding when no images', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue({ ...baseDistributor, slug: DISTRIBUTOR_SLUG });
      const result = await service.getDistributor(DISTRIBUTOR_SLUG);
      expect(result.id).toBe(DISTRIBUTOR_ID);
      expect(result.logoUrl).toBeNull();
      expect(result.bannerUrl).toBeNull();
      expect(result.bannerDominantColor).toBeNull();
    });

    it('returns logoUrl from full variant when logo image exists', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue({ ...baseDistributor, slug: DISTRIBUTOR_SLUG });
      mockPrisma.assetImage.findFirst
        .mockResolvedValueOnce({ variants: { full: 'distributors/dist-1/branding/logo/img-1/full.webp' }, dominantColor: null })
        .mockResolvedValueOnce(null);
      const result = await service.getDistributor(DISTRIBUTOR_SLUG);
      expect(result.logoUrl).toBe('https://cdn.example.com/distributors/dist-1/branding/logo/img-1/full.webp');
    });

    it('returns bannerUrl from mobile variant and dominant colour when banner image exists', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue({ ...baseDistributor, slug: DISTRIBUTOR_SLUG });
      mockPrisma.assetImage.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          variants: { mobile: 'distributors/dist-1/branding/banner/img-2/mobile.webp' },
          dominantColor: '#3d6e3c',
        });
      const result = await service.getDistributor(DISTRIBUTOR_SLUG);
      expect(result.bannerUrl).toBe('https://cdn.example.com/distributors/dist-1/branding/banner/img-2/mobile.webp');
      expect(result.bannerDominantColor).toBe('#3d6e3c');
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

  describe('getProduct', () => {
    it('throws NotFoundException when distributor does not exist', async () => {
      mockPrisma.organisation.findFirst.mockResolvedValue(null);
      await expect(service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      await expect(service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when product is not in customer catalogues', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue({ id: RELATIONSHIP_ID });
      mockPrisma.customerCatalogue.findMany.mockResolvedValue([
        { catalogue: { products: [{ productId: 'other-product' }] } },
      ]);
      // Product exists in DB but is not in the customer's catalogue
      mockPrisma.product.findFirst.mockResolvedValue(makeProduct(PRODUCT_ID_1));

      await expect(service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1, CUSTOMER_ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns the correct product by id rather than an arbitrary catalogue entry', async () => {
      const target = { ...makeProduct(PRODUCT_ID_1), description: 'The real description' };
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue({ id: RELATIONSHIP_ID });
      mockPrisma.customerCatalogue.findMany.mockResolvedValue([
        { catalogue: { products: [{ productId: PRODUCT_ID_1 }, { productId: PRODUCT_ID_2 }] } },
      ]);
      mockPrisma.product.findFirst.mockResolvedValue(target);

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1, CUSTOMER_ORG_ID);

      expect(result.id).toBe(PRODUCT_ID_1);
      expect(result.description).toBe('The real description');
      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: PRODUCT_ID_1 }) }),
      );
    });

    it('returns imageUrl from catalogue variant of primary image', async () => {
      mockPrisma.assetImage.findFirst.mockResolvedValue({
        variants: { thumb: 'key/thumb.webp', catalogue: 'key/catalogue.webp', large: 'key/large.webp' },
      });

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1);

      expect(result.imageUrl).toBe('https://cdn.example.com/key/catalogue.webp');
    });

    it('falls back to large variant when catalogue variant is absent', async () => {
      mockPrisma.assetImage.findFirst.mockResolvedValue({
        variants: { thumb: 'key/thumb.webp', large: 'key/large.webp' },
      });

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1);

      expect(result.imageUrl).toBe('https://cdn.example.com/key/large.webp');
    });

    it('returns imageUrl null when no primary image exists', async () => {
      mockPrisma.assetImage.findFirst.mockResolvedValue(null);

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1);

      expect(result.imageUrl).toBeNull();
    });

    it('returns imageUrl null when primary image has only thumb variant', async () => {
      mockPrisma.assetImage.findFirst.mockResolvedValue({
        variants: { thumb: 'key/thumb.webp' },
      });

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1);

      expect(result.imageUrl).toBeNull();
    });

    it('returns thumbnailUrl from thumb variant', async () => {
      mockPrisma.assetImage.findFirst.mockResolvedValue({
        variants: { thumb: 'key/thumb.webp', catalogue: 'key/catalogue.webp' },
      });

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1);

      expect(result.thumbnailUrl).toBe('https://cdn.example.com/key/thumb.webp');
    });

    it('scopes product query to distributor id', async () => {
      await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1);

      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ distributorId: DISTRIBUTOR_ID }),
        }),
      );
    });

    it('scopes assetImage query to distributor id', async () => {
      await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1);

      expect(mockPrisma.assetImage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ distributorId: DISTRIBUTOR_ID }),
        }),
      );
    });

    it('returns resolvedPrice for a FIXED_PRICE rule', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue({ id: RELATIONSHIP_ID });
      mockPrisma.customerCatalogue.findMany.mockResolvedValue([
        { catalogue: { products: [{ productId: PRODUCT_ID_1 }] } },
      ]);
      mockPriceResolution.resolvePriceListId.mockResolvedValue('price-list-1');
      mockPrisma.priceListRule.findMany.mockResolvedValue([
        {
          selectorType: PriceListRuleSelectorType.PRODUCT,
          productId: PRODUCT_ID_1,
          minQuantity: 1,
          valueType: PriceListRuleValueType.FIXED_PRICE,
          unitPrice: makeDecimal('15.00'),
          discountPercentage: null,
          discountBaseType: null,
          basePriceListId: null,
        },
      ]);

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1, CUSTOMER_ORG_ID);

      expect(result.resolvedPrice).toBe('15.00');
    });

    it('returns resolvedPrice null when customer has no price list', async () => {
      mockPrisma.tradeRelationship.findFirst.mockResolvedValue({ id: RELATIONSHIP_ID });
      mockPrisma.customerCatalogue.findMany.mockResolvedValue([
        { catalogue: { products: [{ productId: PRODUCT_ID_1 }] } },
      ]);
      mockPriceResolution.resolvePriceListId.mockResolvedValue(null);

      const result = await service.getProduct(DISTRIBUTOR_SLUG, PRODUCT_ID_1, CUSTOMER_ORG_ID);

      expect(result.resolvedPrice).toBeNull();
    });
  });
});
