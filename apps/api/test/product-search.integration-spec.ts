/**
 * Integration tests for product search (ADR-050).
 * Ranking correctness (tiers, typo/accent tolerance) and distributor isolation
 * are real-database concerns — pg_trgm and tsvector behaviour cannot be mocked.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { Test } from '@nestjs/testing';
import { OrganisationType } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductSearchModule } from '../src/product-search/product-search.module';
import { ProductSearchService } from '../src/product-search/product-search.service';

const DIST_A = 'test-search-dist-a';
const DIST_B = 'test-search-dist-b';

const PRODUCTS = [
  {
    id: 'test-search-p1',
    distributorId: DIST_A,
    name: 'Cabernet Franc',
    sku: 'MER-1',
    description: 'Structured red',
  },
  {
    id: 'test-search-p2',
    distributorId: DIST_A,
    name: 'Merlot',
    sku: 'X-1',
    description: null,
  },
  {
    id: 'test-search-p3',
    distributorId: DIST_A,
    name: 'Merlot Reserve',
    sku: 'X-2',
    description: null,
  },
  {
    id: 'test-search-p4',
    distributorId: DIST_A,
    name: 'Red Blend',
    sku: 'X-3',
    description: 'Softened with merlot notes',
  },
  {
    id: 'test-search-p5',
    distributorId: DIST_A,
    name: 'Sauvignon Blanc Reserve',
    sku: 'SAV-100',
    description: 'Crisp white wine',
  },
  {
    id: 'test-search-p6',
    distributorId: DIST_A,
    name: 'Château Margaux',
    sku: 'CM-2019',
    description: null,
  },
  {
    id: 'test-search-p7',
    distributorId: DIST_B,
    name: 'Merlot Magnifique',
    sku: 'MER-B',
    description: 'Distributor B merlot',
  },
];

describe('ProductSearch (integration)', () => {
  let prisma: PrismaService;
  let search: ProductSearchService;

  const ids = (hits: Array<{ productId: string }>) => hits.map((h) => h.productId);
  const query = (q: string, distributorId = DIST_A) =>
    search.search(distributorId, q, { limit: 50, offset: 0 });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, ProductSearchModule],
    }).compile();

    prisma = module.get(PrismaService);
    await prisma.$connect();
    search = module.get(ProductSearchService);

    for (const [id, name] of [
      [DIST_A, 'Search Test Distributor A'],
      [DIST_B, 'Search Test Distributor B'],
    ] as const) {
      await prisma.organisation.upsert({
        where: { id },
        create: { id, name, type: OrganisationType.DISTRIBUTOR },
        update: {},
      });
    }

    for (const product of PRODUCTS) {
      await prisma.product.upsert({
        where: { id: product.id },
        create: { ...product, status: 'ACTIVE' },
        update: { name: product.name, sku: product.sku, description: product.description },
      });
      await search.indexProduct(product);
    }
  });

  afterAll(async () => {
    const productIds = PRODUCTS.map((p) => p.id);
    await prisma.productSearchDocument.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await prisma.$disconnect();
  });

  describe('ranking tiers', () => {
    it('ranks an exact SKU match first', async () => {
      const hits = await query('mer-1');

      expect(ids(hits)[0]).toBe('test-search-p1');
      expect(hits[0].tier).toBe(0);
    });

    it('ranks SKU fragment above name and description matches', async () => {
      const hits = await query('mer');

      // p1 sku MER-1 (tier 1) before merlot-named products (tier 3)
      expect(ids(hits)[0]).toBe('test-search-p1');
      const p3Index = ids(hits).indexOf('test-search-p3');
      expect(p3Index).toBeGreaterThan(0);
    });

    it('ranks exact name above name fragment above description match', async () => {
      const hits = await query('merlot');

      const order = ids(hits);
      const exact = order.indexOf('test-search-p2'); // name = Merlot
      const fragment = order.indexOf('test-search-p3'); // name = Merlot Reserve
      const description = order.indexOf('test-search-p4'); // description mentions merlot

      expect(exact).toBeGreaterThanOrEqual(0);
      expect(fragment).toBeGreaterThan(exact);
      expect(description).toBeGreaterThan(fragment);
    });

    it('is case-insensitive', async () => {
      const hits = await query('MERLOT');

      expect(ids(hits)).toContain('test-search-p2');
    });
  });

  describe('fuzzy matching', () => {
    it('tolerates typos in names ("savignon" finds Sauvignon)', async () => {
      const hits = await query('savignon');

      expect(ids(hits)).toContain('test-search-p5');
    });

    it('is accent-insensitive ("chateau" finds Château)', async () => {
      const hits = await query('chateau');

      expect(ids(hits)).toContain('test-search-p6');
    });

    it('matches name fragments ("chard" style prefix)', async () => {
      const hits = await query('sauv');

      expect(ids(hits)).toContain('test-search-p5');
    });
  });

  describe('distributor isolation', () => {
    it('never returns another distributor\'s products', async () => {
      const hits = await query('merlot');

      expect(ids(hits)).not.toContain('test-search-p7');
    });

    it('scopes results to the queried distributor', async () => {
      const hits = await query('merlot', DIST_B);

      expect(ids(hits)).toEqual(['test-search-p7']);
    });
  });

  describe('document lifecycle', () => {
    it('re-indexing after an update makes the new name searchable', async () => {
      const updated = { ...PRODUCTS[1], name: 'Grenache' };
      await search.indexProduct(updated);

      try {
        const oldName = await query('merlot');
        expect(ids(oldName)).not.toContain('test-search-p2');

        const newName = await query('grenache');
        expect(ids(newName)).toContain('test-search-p2');
      } finally {
        await search.indexProduct(PRODUCTS[1]);
      }
    });

    it('removeProduct drops the product from results', async () => {
      await search.removeProduct('test-search-p3');

      try {
        const hits = await query('merlot');
        expect(ids(hits)).not.toContain('test-search-p3');
      } finally {
        await search.indexProduct(PRODUCTS[2]);
      }
    });

    it('returns no hits for an empty query', async () => {
      expect(await query('   ')).toEqual([]);
    });
  });
});
