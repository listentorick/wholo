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
import { OrganisationType, ProductStatus, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-integration-dist-a';
const DIST_B = 'test-integration-dist-b';
const ADMIN_A = 'test-products-admin-a';
const ADMIN_A_KEYCLOAK_ID = 'kc-test-products-admin-a';

describe('Admin Products (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

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
    const admin = await prisma.user.upsert({
      where: { id: ADMIN_A },
      create: {
        id: ADMIN_A,
        email: 'products-admin@integration.test',
        keycloakId: ADMIN_A_KEYCLOAK_ID,
        firstName: 'Products',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_A_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: admin.id, organisationId: DIST_A } },
      create: { userId: admin.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: ADMIN_A_KEYCLOAK_ID, email: 'products-admin@integration.test' });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.productType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.supplier.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: ADMIN_A } });
    await prisma.user.deleteMany({ where: { id: ADMIN_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.productType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.supplier.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  // ── GET /admin/distributors/:distributorId/products ────────────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/products', () => {
    it('returns only the requesting distributor\'s products', async () => {
      const productA = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE },
      });
      await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/products`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(productA.id);
    });

    it('returns an empty list when the distributor has no products', async () => {
      await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/products`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns 403 when requesting a distributor the caller has no membership for', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_B}/products`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/distributors/:distributorId/products/:id ────────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/products/:id', () => {
    it('returns 404 when the product belongs to a different distributor than the one in the path', async () => {
      const productB = await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/products/${productB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns the product when it belongs to the requesting distributor', async () => {
      const productA = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/products/${productA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(productA.id);
      expect(res.body.distributorId).toBe(DIST_A);
    });
  });

  // ── POST /admin/distributors/:distributorId/products ───────────────────────

  describe('POST /api/v1/admin/distributors/:distributorId/products', () => {
    it('stamps the created product with the requesting distributor id, not user-supplied input', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/products`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Product', status: 'DRAFT' });

      expect(res.status).toBe(201);
      expect(res.body.distributorId).toBe(DIST_A);

      const inDb = await prisma.product.findUnique({ where: { id: res.body.id } });
      expect(inDb?.distributorId).toBe(DIST_A);
    });
  });

  // ── PATCH /admin/distributors/:distributorId/products/:id ──────────────────

  describe('PATCH /api/v1/admin/distributors/:distributorId/products/:id', () => {
    it('returns 403 and leaves the product unchanged when it belongs to a different distributor', async () => {
      const productB = await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Original Name', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/distributors/${DIST_A}/products/${productB.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Stolen update' });

      expect(res.status).toBe(403);

      const unchanged = await prisma.product.findUnique({ where: { id: productB.id } });
      expect(unchanged?.name).toBe('Original Name');
    });
  });

  // ── DELETE /admin/distributors/:distributorId/products/:id ─────────────────

  describe('DELETE /api/v1/admin/distributors/:distributorId/products/:id', () => {
    it('returns 403 and does not soft-delete when the product belongs to a different distributor', async () => {
      const productB = await prisma.product.create({
        data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/distributors/${DIST_A}/products/${productB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);

      const stillAlive = await prisma.product.findUnique({ where: { id: productB.id } });
      expect(stillAlive?.deletedAt).toBeNull();
    });

    it('soft-deletes and returns 204 when the product belongs to the requesting distributor', async () => {
      const productA = await prisma.product.create({
        data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/distributors/${DIST_A}/products/${productA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);

      const softDeleted = await prisma.product.findUnique({ where: { id: productA.id } });
      expect(softDeleted?.deletedAt).not.toBeNull();
    });
  });

  // ── GET /admin/distributors/:distributorId/product-types ───────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/product-types', () => {
    it('returns only product types belonging to the requesting distributor', async () => {
      await prisma.productType.create({
        data: { distributorId: DIST_A, name: 'Wine A', code: 'wine-a', displayOrder: 1 },
      });
      await prisma.productType.create({
        data: { distributorId: DIST_B, name: 'Wine B', code: 'wine-b', displayOrder: 1 },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/product-types`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Wine A');
    });
  });

  // ── GET /admin/distributors/:distributorId/suppliers ────────────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/suppliers', () => {
    it('returns only suppliers belonging to the requesting distributor', async () => {
      await prisma.supplier.create({
        data: { distributorId: DIST_A, name: 'Supplier A' },
      });
      await prisma.supplier.create({
        data: { distributorId: DIST_B, name: 'Supplier B' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/suppliers`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Supplier A');
    });
  });
});
