/**
 * Integration tests for admin customers endpoints.
 * Verifies multi-tenancy isolation against a real database.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, TradeRelationshipStatus, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-customers-dist-a';
const DIST_B = 'test-customers-dist-b';
const ADMIN_A = 'test-customers-admin-a';
const ADMIN_A_KEYCLOAK_ID = 'kc-test-customers-admin-a';

describe('Admin Customers (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.organisation.upsert({
      where: { id: DIST_A },
      create: { id: DIST_A, name: 'Customers Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Customers Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const admin = await prisma.user.upsert({
      where: { id: ADMIN_A },
      create: {
        id: ADMIN_A,
        email: 'customers-admin@integration.test',
        keycloakId: ADMIN_A_KEYCLOAK_ID,
        firstName: 'Customers',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_A_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: admin.id, organisationId: DIST_A } },
      create: { userId: admin.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: ADMIN_A_KEYCLOAK_ID, email: 'customers-admin@integration.test' });
  });

  afterAll(async () => {
    const rels = await prisma.tradeRelationship.findMany({
      where: { distributorId: { in: [DIST_A, DIST_B] } },
      select: { id: true, customerId: true },
    });
    await prisma.customerInvitation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: ADMIN_A } });
    await prisma.user.deleteMany({ where: { id: ADMIN_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, ...rels.map((r) => r.customerId)] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    const rels = await prisma.tradeRelationship.findMany({
      where: { distributorId: { in: [DIST_A, DIST_B] } },
      select: { id: true, customerId: true },
    });
    await prisma.customerInvitation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    const customerOrgIds = rels.map((r) => r.customerId).filter((id) => ![DIST_A, DIST_B].includes(id));
    if (customerOrgIds.length > 0) {
      await prisma.organisation.deleteMany({ where: { id: { in: customerOrgIds } } });
    }
  });

  const createCustomer = async (distributorId: string, name = 'Test Customer') => {
    const org = await prisma.organisation.create({
      data: { name, type: OrganisationType.TRADE_CUSTOMER },
    });
    return prisma.tradeRelationship.create({
      data: {
        distributorId,
        customerId: org.id,
        status: TradeRelationshipStatus.ACTIVE,
      },
    });
  };

  // ── GET /admin/customers ───────────────────────────────────────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/customers', () => {
    it('returns only the requesting distributor\'s customers', async () => {
      const relA = await createCustomer(DIST_A, 'Customer A');
      await createCustomer(DIST_B, 'Customer B');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/customers`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(relA.id);
    });

    it('returns 403 when requesting a distributor the caller has no membership for', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_B}/customers`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/distributors/:distributorId/customers/:id ───────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/customers/:id', () => {
    it('returns 404 when customer belongs to a different distributor than the one in the path', async () => {
      const relB = await createCustomer(DIST_B);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/customers/${relB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns the customer for the correct distributor', async () => {
      const relA = await createCustomer(DIST_A);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/customers/${relA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(relA.id);
      expect(res.body.distributorId).toBe(DIST_A);
    });
  });

  // ── POST /admin/distributors/:distributorId/customers ──────────────────────

  describe('POST /api/v1/admin/distributors/:distributorId/customers', () => {
    it('stamps the created customer with the requesting distributor id', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/customers`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Customer' });

      expect(res.status).toBe(201);
      expect(res.body.distributorId).toBe(DIST_A);

      const inDb = await prisma.tradeRelationship.findUnique({ where: { id: res.body.id } });
      expect(inDb?.distributorId).toBe(DIST_A);
    });
  });

  // ── PATCH /admin/distributors/:distributorId/customers/:id ─────────────────

  describe('PATCH /api/v1/admin/distributors/:distributorId/customers/:id', () => {
    it('returns 404 and leaves customer unchanged when it belongs to a different distributor', async () => {
      const relB = await createCustomer(DIST_B, 'Original Name');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/distributors/${DIST_A}/customers/${relB.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'Stolen update' });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /admin/distributors/:distributorId/customers/:id ────────────────

  describe('DELETE /api/v1/admin/distributors/:distributorId/customers/:id', () => {
    it('returns 404 and does not soft-delete when customer belongs to different distributor', async () => {
      const relB = await createCustomer(DIST_B);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/distributors/${DIST_A}/customers/${relB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);

      const inDb = await prisma.tradeRelationship.findUnique({ where: { id: relB.id } });
      expect(inDb?.deletedAt).toBeNull();
    });

    it('soft-deletes and returns 204 for the correct distributor', async () => {
      const relA = await createCustomer(DIST_A);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/distributors/${DIST_A}/customers/${relA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);

      const inDb = await prisma.tradeRelationship.findUnique({ where: { id: relA.id } });
      expect(inDb?.deletedAt).not.toBeNull();
    });
  });
});
