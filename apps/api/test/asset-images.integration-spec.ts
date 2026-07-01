/**
 * Integration tests for asset-images endpoints.
 *
 * These tests hit a real database to verify multi-tenancy isolation.
 * R2StorageService is stubbed — no real Cloudflare calls are made.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp').default = require('sharp');
import { OrganisationType, ProductStatus, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { R2StorageService } from '../src/asset-images/r2-storage.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-img-dist-a';
const DIST_B = 'test-img-dist-b';
const ADMIN_A = 'test-img-admin-a';
const ADMIN_A_KEYCLOAK_ID = 'kc-test-img-admin-a';
const ADMIN_B = 'test-img-admin-b';
const ADMIN_B_KEYCLOAK_ID = 'kc-test-img-admin-b';

const mockR2 = {
  upload: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
};

describe('Asset Images (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let tokenA: string;
  let tokenB: string;
  let png200: Buffer;
  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    png200 = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .png()
      .toBuffer();

    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(R2StorageService)
      .useValue(mockR2)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.organisation.upsert({
      where: { id: DIST_A },
      create: { id: DIST_A, name: 'Image Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Image Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const adminA = await prisma.user.upsert({
      where: { id: ADMIN_A },
      create: { id: ADMIN_A, email: 'img-admin-a@integration.test', keycloakId: ADMIN_A_KEYCLOAK_ID, firstName: 'Img', lastName: 'AdminA' },
      update: { keycloakId: ADMIN_A_KEYCLOAK_ID },
    });
    const adminB = await prisma.user.upsert({
      where: { id: ADMIN_B },
      create: { id: ADMIN_B, email: 'img-admin-b@integration.test', keycloakId: ADMIN_B_KEYCLOAK_ID, firstName: 'Img', lastName: 'AdminB' },
      update: { keycloakId: ADMIN_B_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: adminA.id, organisationId: DIST_A } },
      create: { userId: adminA.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: adminB.id, organisationId: DIST_B } },
      create: { userId: adminB.id, organisationId: DIST_B, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    tokenA = jwtServer.signToken({ sub: ADMIN_A_KEYCLOAK_ID, email: 'img-admin-a@integration.test' });
    tokenB = jwtServer.signToken({ sub: ADMIN_B_KEYCLOAK_ID, email: 'img-admin-b@integration.test' });
  });

  afterAll(async () => {
    await prisma.assetImage.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: { in: [ADMIN_A, ADMIN_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_A, ADMIN_B] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.assetImage.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });

    const productA = await prisma.product.create({
      data: { distributorId: DIST_A, name: 'Product A', status: ProductStatus.ACTIVE },
    });
    const productB = await prisma.product.create({
      data: { distributorId: DIST_B, name: 'Product B', status: ProductStatus.ACTIVE },
    });
    productAId = productA.id;
    productBId = productB.id;
    jest.clearAllMocks();
    mockR2.upload.mockResolvedValue(undefined);
    mockR2.delete.mockResolvedValue(undefined);
    mockR2.getPublicUrl.mockImplementation((key: string) => `https://cdn.example.com/${key}`);
  });

  describe('POST /api/v1/admin/distributors/:distributorId/asset-images', () => {
    it('returns 400 for unknown assetType', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'unknown-type')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'test.png', contentType: 'image/png' });

      expect(res.status).toBe(400);
    });

    it('returns 404 when uploading to another distributor\'s product', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productBId)
        .attach('file', png200, { filename: 'test.png', contentType: 'image/png' });

      expect(res.status).toBe(404);
    });

    it('returns 201 with correct data on valid upload', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'photo.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.assetType).toBe('product-image');
      expect(res.body.entityId).toBe(productAId);
      expect(res.body.distributorId).toBe(DIST_A);
      expect(res.body.isPrimary).toBe(true);
      expect(res.body.sortOrder).toBe(0);
      expect(res.body.variants).toBeDefined();
      expect(res.body.variants.thumb).toContain('https://cdn.example.com/');
      expect(res.body.variants.catalogue).toContain('https://cdn.example.com/');
      expect(res.body.variants.large).toContain('https://cdn.example.com/');
    });

    it('second upload is not primary and has sortOrder 1', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'photo.png', contentType: 'image/png' });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'photo2.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.isPrimary).toBe(false);
      expect(res.body.sortOrder).toBe(1);
    });

    it('returns 415 for unsupported file type', async () => {
      const gifBuffer = Buffer.from('GIF89a');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', gifBuffer, { filename: 'anim.gif', contentType: 'image/gif' });

      expect(res.status).toBe(415);
    });

    it('creates a DB record with correct keys stored', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'photo.png', contentType: 'image/png' });

      const dbRecord = await prisma.assetImage.findFirst({ where: { distributorId: DIST_A } });
      expect(dbRecord).toBeTruthy();
      expect(dbRecord!.assetType).toBe('product-image');
      const keys = dbRecord!.variants as Record<string, string>;
      expect(keys.thumb).toContain(DIST_A);
      expect(keys.thumb).toContain(productAId);
      expect(keys.thumb).not.toContain('https://');
    });

    it('returns 403 when requesting a distributor the caller has no membership for', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_B}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productBId)
        .attach('file', png200, { filename: 'test.png', contentType: 'image/png' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/admin/distributors/:distributorId/asset-images', () => {
    it('returns empty array for another distributor\'s entity', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'photo.png', contentType: 'image/png' });

      // DIST_B's own admin, authorized for DIST_B, querying productA's images
      // (which belong to DIST_A) — service-level scoping must still return empty.
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_B}/asset-images?assetType=product-image&entityId=${productAId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('returns images ordered by sortOrder', async () => {
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
          .set('Authorization', `Bearer ${tokenA}`)
          .field('assetType', 'product-image')
          .field('entityId', productAId)
          .attach('file', png200, { filename: `photo${i}.png`, contentType: 'image/png' });
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/asset-images?assetType=product-image&entityId=${productAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].sortOrder).toBeLessThan(res.body[1].sortOrder);
    });
  });

  describe('DELETE /api/v1/admin/distributors/:distributorId/asset-images/:id', () => {
    it('returns 404 when deleting another distributor\'s image', async () => {
      const upload = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'photo.png', contentType: 'image/png' });

      // DIST_B's own admin, authorized for DIST_B, trying to delete an image
      // that belongs to DIST_A — service-level ownership check must reject.
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/distributors/${DIST_B}/asset-images/${upload.body.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });

    it('returns 204 and removes DB record and calls r2.delete', async () => {
      const upload = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
        .set('Authorization', `Bearer ${tokenA}`)
        .field('assetType', 'product-image')
        .field('entityId', productAId)
        .attach('file', png200, { filename: 'photo.png', contentType: 'image/png' });

      const imageId = upload.body.id;
      jest.clearAllMocks();

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/distributors/${DIST_A}/asset-images/${imageId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(204);
      expect(mockR2.delete).toHaveBeenCalledTimes(3); // thumb, catalogue, large
      const dbRecord = await prisma.assetImage.findFirst({ where: { id: imageId } });
      expect(dbRecord).toBeNull();
    });

    it('promotes next image to primary when primary is deleted', async () => {
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
          .set('Authorization', `Bearer ${tokenA}`)
          .field('assetType', 'product-image')
          .field('entityId', productAId)
          .attach('file', png200, { filename: `photo${i}.png`, contentType: 'image/png' });
      }

      const images = await prisma.assetImage.findMany({
        where: { distributorId: DIST_A },
        orderBy: { sortOrder: 'asc' },
      });
      const primaryId = images[0].id;
      const secondId = images[1].id;

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/distributors/${DIST_A}/asset-images/${primaryId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      const promoted = await prisma.assetImage.findFirst({ where: { id: secondId } });
      expect(promoted!.isPrimary).toBe(true);
    });
  });

  describe('PUT /api/v1/admin/distributors/:distributorId/asset-images/reorder', () => {
    it('updates sortOrder correctly', async () => {
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/admin/distributors/${DIST_A}/asset-images`)
          .set('Authorization', `Bearer ${tokenA}`)
          .field('assetType', 'product-image')
          .field('entityId', productAId)
          .attach('file', png200, { filename: `photo${i}.png`, contentType: 'image/png' });
      }

      const images = await prisma.assetImage.findMany({
        where: { distributorId: DIST_A },
        orderBy: { sortOrder: 'asc' },
      });
      const [first, second] = images;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/admin/distributors/${DIST_A}/asset-images/reorder`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assetType: 'product-image', entityId: productAId, imageIds: [second.id, first.id] });

      expect(res.status).toBe(200);
      const reordered = res.body as Array<{ id: string; sortOrder: number }>;
      expect(reordered.find(r => r.id === second.id)!.sortOrder).toBe(0);
      expect(reordered.find(r => r.id === first.id)!.sortOrder).toBe(1);
    });
  });
});
