/**
 * Integration tests for tax types endpoints.
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
import { OrganisationType, Role, TaxClassification } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-integration-taxtype-dist-a';
const DIST_B = 'test-integration-taxtype-dist-b';
const ADMIN_A = 'test-taxtype-admin-a';
const ADMIN_A_KEYCLOAK_ID = 'kc-test-taxtype-admin-a';

describe('Tax Types (integration)', () => {
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
        email: 'taxtype-admin@integration.test',
        keycloakId: ADMIN_A_KEYCLOAK_ID,
        firstName: 'TaxType',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_A_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: admin.id, organisationId: DIST_A } },
      create: { userId: admin.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: ADMIN_A_KEYCLOAK_ID, email: 'taxtype-admin@integration.test' });
  });

  afterAll(async () => {
    await prisma.taxType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: ADMIN_A } });
    await prisma.user.deleteMany({ where: { id: ADMIN_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.taxType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  // ── GET /distributors/:distributorId/tax-types ──────────────────────────────

  describe('GET /api/v1/distributors/:distributorId/tax-types', () => {
    it('returns only the requesting distributor\'s tax types', async () => {
      const taxTypeA = await prisma.taxType.create({
        data: { distributorId: DIST_A, name: 'Standard A', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });
      await prisma.taxType.create({
        data: { distributorId: DIST_B, name: 'Standard B', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/tax-types`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(taxTypeA.id);
    });

    it('returns 403 when requesting a distributor the caller has no membership for', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B}/tax-types`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── GET /distributors/:distributorId/tax-types/:id ──────────────────────────

  describe('GET /api/v1/distributors/:distributorId/tax-types/:id', () => {
    it('returns 404 when the tax type belongs to a different distributor than the one in the path', async () => {
      const taxTypeB = await prisma.taxType.create({
        data: { distributorId: DIST_B, name: 'Standard B', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/tax-types/${taxTypeB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns the tax type when it belongs to the requesting distributor', async () => {
      const taxTypeA = await prisma.taxType.create({
        data: { distributorId: DIST_A, name: 'Standard A', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/tax-types/${taxTypeA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(taxTypeA.id);
      expect(res.body.distributorId).toBe(DIST_A);
    });
  });

  // ── POST /distributors/:distributorId/tax-types ─────────────────────────────

  describe('POST /api/v1/distributors/:distributorId/tax-types', () => {
    it('stamps the created tax type with the requesting distributor id, not user-supplied input', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/tax-types`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Standard rate', classification: 'STANDARD', ratePercentage: '20.00' });

      expect(res.status).toBe(201);
      expect(res.body.distributorId).toBe(DIST_A);

      const inDb = await prisma.taxType.findUnique({ where: { id: res.body.id } });
      expect(inDb?.distributorId).toBe(DIST_A);
    });
  });

  // ── PATCH /distributors/:distributorId/tax-types/:id ────────────────────────

  describe('PATCH /api/v1/distributors/:distributorId/tax-types/:id', () => {
    it('returns 404 and leaves the tax type unchanged when it belongs to a different distributor', async () => {
      const taxTypeB = await prisma.taxType.create({
        data: { distributorId: DIST_B, name: 'Original Name', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/tax-types/${taxTypeB.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Stolen update' });

      expect(res.status).toBe(404);

      const unchanged = await prisma.taxType.findUnique({ where: { id: taxTypeB.id } });
      expect(unchanged?.name).toBe('Original Name');
    });
  });

  // ── DELETE /distributors/:distributorId/tax-types/:id (deactivate) ─────────

  describe('DELETE /api/v1/distributors/:distributorId/tax-types/:id', () => {
    it('returns 404 and does not deactivate when the tax type belongs to a different distributor', async () => {
      const taxTypeB = await prisma.taxType.create({
        data: { distributorId: DIST_B, name: 'Standard B', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/distributors/${DIST_A}/tax-types/${taxTypeB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);

      const stillActive = await prisma.taxType.findUnique({ where: { id: taxTypeB.id } });
      expect(stillActive?.active).toBe(true);
    });

    it('deactivates (soft, never deletes) when the tax type belongs to the requesting distributor', async () => {
      const taxTypeA = await prisma.taxType.create({
        data: { distributorId: DIST_A, name: 'Standard A', classification: TaxClassification.STANDARD, ratePercentage: '20.00' },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/distributors/${DIST_A}/tax-types/${taxTypeA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);

      const inDb = await prisma.taxType.findUnique({ where: { id: taxTypeA.id } });
      expect(inDb).not.toBeNull();
      expect(inDb?.active).toBe(false);
    });
  });
});
