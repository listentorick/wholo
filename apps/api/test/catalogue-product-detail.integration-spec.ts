/**
 * Integration tests for GET /api/v1/distributors/:slug/products/:productId
 *
 * These tests hit a real database to verify that the catalogue membership gate
 * and multi-tenancy isolation are enforced correctly — something unit tests
 * with mocked Prisma cannot guarantee.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { OrganisationType, ProductStatus, TradeRelationshipStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';

const DIST_A      = 'integ-cat-detail-dist-a';
const DIST_A_SLUG = 'integ-cat-detail-dist-a-slug';
const DIST_B      = 'integ-cat-detail-dist-b';
const DIST_B_SLUG = 'integ-cat-detail-dist-b-slug';
const CUSTOMER    = 'integ-cat-detail-customer';
const JWT_SECRET  = process.env.JWT_SECRET ?? 'dev-secret';

function makeToken(organisationId: string) {
  return jwt.sign(
    { sub: organisationId, email: 'test@integration.com', role: 'TRADE_CUSTOMER', organisationId },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('Catalogue Product Detail (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productAId: string;
  let productBId: string;
  let relationshipId: string;
  let catalogueId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.organisation.upsert({
      where: { id: DIST_A },
      create: { id: DIST_A, name: 'Integration Cat Detail Distributor A', type: OrganisationType.DISTRIBUTOR, slug: DIST_A_SLUG },
      update: { slug: DIST_A_SLUG },
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Integration Cat Detail Distributor B', type: OrganisationType.DISTRIBUTOR, slug: DIST_B_SLUG },
      update: { slug: DIST_B_SLUG },
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER },
      create: { id: CUSTOMER, name: 'Integration Cat Detail Customer', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.assetImage.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.catalogueProduct.deleteMany({ where: { catalogue: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.customerCatalogue.deleteMany({ where: { catalogue: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.catalogue.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER] } } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.assetImage.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.catalogueProduct.deleteMany({ where: { catalogue: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.customerCatalogue.deleteMany({ where: { catalogue: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.catalogue.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });

    const productA = await prisma.product.create({
      data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE, price: 10 },
    });
    productAId = productA.id;

    const productB = await prisma.product.create({
      data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
    });
    productBId = productB.id;

    const relationship = await prisma.tradeRelationship.create({
      data: { distributorId: DIST_A, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
    });
    relationshipId = relationship.id;

    const catalogue = await prisma.catalogue.create({
      data: { distributorId: DIST_A, name: 'Test Catalogue A' },
    });
    catalogueId = catalogue.id;

    await prisma.catalogueProduct.create({
      data: { catalogueId, productId: productAId },
    });

    await prisma.customerCatalogue.create({
      data: { tradeRelationshipId: relationshipId, catalogueId },
    });
  });

  describe('GET /api/v1/distributors/:slug/products/:productId', () => {
    it('returns 200 for a product in the customer\'s assigned catalogue', async () => {
      const token = makeToken(CUSTOMER);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A_SLUG}/products/${productAId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(productAId);
      expect(res.body.name).toBe('Product A');
    });

    it('returns 401 without an Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A_SLUG}/products/${productAId}`);

      expect(res.status).toBe(401);
    });

    it('returns 404 when the product belongs to a different distributor\'s slug', async () => {
      const token = makeToken(CUSTOMER);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B_SLUG}/products/${productBId}`)
        .set('Authorization', `Bearer ${token}`);

      // DIST_B slug resolves to DIST_B, but customer has no relationship with DIST_B
      expect(res.status).toBe(404);
    });

    it('returns 404 when accessing a DIST_B product via DIST_A slug', async () => {
      const token = makeToken(CUSTOMER);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A_SLUG}/products/${productBId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when product exists but is not in customer\'s assigned catalogues', async () => {
      const unlistedProduct = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Unlisted Product', status: ProductStatus.ACTIVE },
      });
      const token = makeToken(CUSTOMER);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A_SLUG}/products/${unlistedProduct.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for a non-existent product id', async () => {
      const token = makeToken(CUSTOMER);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A_SLUG}/products/non-existent-id`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns imageUrl containing the catalogue variant URL when a primary image exists', async () => {
      await prisma.assetImage.create({
        data: {
          id: 'integ-cat-detail-img-1',
          distributorId: DIST_A,
          entityId: productAId,
          assetType: 'product-image',
          isPrimary: true,
          sortOrder: 0,
          sourceMimeType: 'image/webp',
          sourceSizeBytes: 1000,
          variants: {
            thumb: `distributors/${DIST_A}/products/${productAId}/images/img-1/thumb.webp`,
            catalogue: `distributors/${DIST_A}/products/${productAId}/images/img-1/catalogue.webp`,
            large: `distributors/${DIST_A}/products/${productAId}/images/img-1/large.webp`,
          },
        },
      });

      const token = makeToken(CUSTOMER);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A_SLUG}/products/${productAId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.imageUrl).toContain('catalogue.webp');
    });

    it('returns imageUrl null when no primary image exists', async () => {
      const token = makeToken(CUSTOMER);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A_SLUG}/products/${productAId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.imageUrl).toBeNull();
    });
  });
});
