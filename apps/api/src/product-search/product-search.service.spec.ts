import { Test, TestingModule } from '@nestjs/testing';
import { ProductSearchService } from './product-search.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
  product: {
    findMany: jest.fn(),
  },
  productSearchDocument: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const DISTRIBUTOR_ID = 'dist-1';

const product = {
  id: 'prod-1',
  distributorId: DISTRIBUTOR_ID,
  name: 'Château Margaux',
  sku: 'CM-2019',
  description: 'Full-bodied red',
};

describe('ProductSearchService', () => {
  let service: ProductSearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductSearchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductSearchService>(ProductSearchService);
    jest.clearAllMocks();
  });

  describe('indexProduct', () => {
    it('upserts a document with curated and normalised fields', async () => {
      await service.indexProduct(product);

      expect(mockPrisma.productSearchDocument.upsert).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        create: {
          productId: 'prod-1',
          distributorId: DISTRIBUTOR_ID,
          searchText: 'Château Margaux CM-2019 Full-bodied red',
          searchTextNormalised: 'chateau margaux cm-2019 full-bodied red',
          nameNormalised: 'chateau margaux',
          skuNormalised: 'cm-2019',
        },
        update: expect.objectContaining({ nameNormalised: 'chateau margaux' }),
      });
    });

    it('stores null skuNormalised when the product has no sku', async () => {
      await service.indexProduct({ ...product, sku: null });

      const call = mockPrisma.productSearchDocument.upsert.mock.calls[0][0];
      expect(call.create.skuNormalised).toBeNull();
    });

    it('uses the provided transaction client', async () => {
      const tx = { productSearchDocument: { upsert: jest.fn() } };

      await service.indexProduct(product, tx as never);

      expect(tx.productSearchDocument.upsert).toHaveBeenCalled();
      expect(mockPrisma.productSearchDocument.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removeProduct', () => {
    it('deletes the document for the product', async () => {
      await service.removeProduct('prod-1');

      expect(mockPrisma.productSearchDocument.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
      });
    });
  });

  describe('search', () => {
    it('returns [] for empty or whitespace queries without querying', async () => {
      expect(await service.search(DISTRIBUTOR_ID, '   ', { limit: 10, offset: 0 })).toEqual([]);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns ranked hits as plain numbers', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { productId: 'prod-1', tier: 0, score: 1 },
        { productId: 'prod-2', tier: 3, score: 0.5 },
      ]);

      const hits = await service.search(DISTRIBUTOR_ID, 'margaux', { limit: 10, offset: 0 });

      expect(hits).toEqual([
        { productId: 'prod-1', tier: 0, score: 1 },
        { productId: 'prod-2', tier: 3, score: 0.5 },
      ]);
    });
  });

  describe('reindexAll', () => {
    it('indexes every live product and returns the count', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        product,
        { ...product, id: 'prod-2', sku: null },
      ]);
      mockPrisma.productSearchDocument.deleteMany.mockResolvedValue({ count: 0 });

      const count = await service.reindexAll();

      expect(count).toBe(2);
      expect(mockPrisma.productSearchDocument.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
