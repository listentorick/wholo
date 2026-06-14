/**
 * Integration tests for admin products endpoints.
 *
 * These tests hit a real database to verify multi-tenancy isolation —
 * something unit tests with mocked Prisma cannot guarantee.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, ProductStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';

const DIST_A = 'test-integration-dist-a';
const DIST_B = 'test-integration-dist-b';

describe('Admin Products (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

    // Upsert so tests are idempotent even if a prior run left data behind
    await prisma.organisation.upsert({
      where: { id: DIST_A },
      create: { id: DIST_A, name: 'Integration Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Integration Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.productType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.supplier.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.productType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.supplier.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  // ── GET /admin/products ────────────────────────────────────────────────────

  describe('GET /api/v1/admin/products', () => {
    it('returns only the requesting distributor\'s products', async () => {
      const productA = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE },
      });
      await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/products')
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(productA.id);
    });

    it('returns an empty list when the distributor has no products', async () => {
      await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/products')
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ── GET /admin/products/:id ────────────────────────────────────────────────

  describe('GET /api/v1/admin/products/:id', () => {
    it('returns 404 when the product belongs to a different distributor', async () => {
      const productB = await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${productB.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(404);
    });

    it('returns the product when it belongs to the requesting distributor', async () => {
      const productA = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${productA.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(productA.id);
      expect(res.body.distributorId).toBe(DIST_A);
    });
  });

  // ── POST /admin/products ───────────────────────────────────────────────────

  describe('POST /api/v1/admin/products', () => {
    it('stamps the created product with the requesting distributor id, not user-supplied input', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('x-distributor-id', DIST_A)
        .send({ name: 'New Product', status: 'DRAFT' });

      expect(res.status).toBe(201);
      expect(res.body.distributorId).toBe(DIST_A);

      const inDb = await prisma.product.findUnique({ where: { id: res.body.id } });
      expect(inDb?.distributorId).toBe(DIST_A);
    });
  });

  // ── PATCH /admin/products/:id ──────────────────────────────────────────────

  describe('PATCH /api/v1/admin/products/:id', () => {
    it('returns 403 and leaves the product unchanged when it belongs to a different distributor', async () => {
      const productB = await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Original Name', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${productB.id}`)
        .set('x-distributor-id', DIST_A)
        .send({ name: 'Stolen update' });

      expect(res.status).toBe(403);

      const unchanged = await prisma.product.findUnique({ where: { id: productB.id } });
      expect(unchanged?.name).toBe('Original Name');
    });
  });

  // ── DELETE /admin/products/:id ─────────────────────────────────────────────

  describe('DELETE /api/v1/admin/products/:id', () => {
    it('returns 403 and does not soft-delete when the product belongs to a different distributor', async () => {
      const productB = await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${productB.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(403);

      const stillAlive = await prisma.product.findUnique({ where: { id: productB.id } });
      expect(stillAlive?.deletedAt).toBeNull();
    });

    it('soft-deletes and returns 204 when the product belongs to the requesting distributor', async () => {
      const productA = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${productA.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(204);

      const softDeleted = await prisma.product.findUnique({ where: { id: productA.id } });
      expect(softDeleted?.deletedAt).not.toBeNull();
    });
  });

  // ── GET /admin/product-types ───────────────────────────────────────────────

  describe('GET /api/v1/admin/product-types', () => {
    it('returns only product types belonging to the requesting distributor', async () => {
      await prisma.productType.create({
        data: { distributorId: DIST_A, name: 'Wine A', code: 'wine-a', displayOrder: 1 },
      });
      await prisma.productType.create({
        data: { distributorId: DIST_B, name: 'Wine B', code: 'wine-b', displayOrder: 1 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/product-types')
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Wine A');
    });
  });

  // ── GET /admin/suppliers ───────────────────────────────────────────────────

  describe('GET /api/v1/admin/suppliers', () => {
    it('returns only suppliers belonging to the requesting distributor', async () => {
      await prisma.supplier.create({
        data: { distributorId: DIST_A, name: 'Supplier A' },
      });
      await prisma.supplier.create({
        data: { distributorId: DIST_B, name: 'Supplier B' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/suppliers')
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Supplier A');
    });
  });
});
