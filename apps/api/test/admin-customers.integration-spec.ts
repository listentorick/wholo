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
import { OrganisationType, TradeRelationshipStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';

const DIST_A = 'test-customers-dist-a';
const DIST_B = 'test-customers-dist-b';

describe('Admin Customers (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    const rels = await prisma.tradeRelationship.findMany({
      where: { distributorId: { in: [DIST_A, DIST_B] } },
      select: { id: true, customerId: true },
    });
    await prisma.customerInvitation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, ...rels.map((r) => r.customerId)] } } });
    await app.close();
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

  describe('GET /api/v1/admin/customers', () => {
    it('returns only the requesting distributor\'s customers', async () => {
      const relA = await createCustomer(DIST_A, 'Customer A');
      await createCustomer(DIST_B, 'Customer B');

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/customers')
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(relA.id);
    });
  });

  // ── GET /admin/customers/:id ───────────────────────────────────────────────

  describe('GET /api/v1/admin/customers/:id', () => {
    it('returns 404 when customer belongs to a different distributor', async () => {
      const relB = await createCustomer(DIST_B);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/customers/${relB.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(404);
    });

    it('returns the customer for the correct distributor', async () => {
      const relA = await createCustomer(DIST_A);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/customers/${relA.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(relA.id);
      expect(res.body.distributorId).toBe(DIST_A);
    });
  });

  // ── POST /admin/customers ──────────────────────────────────────────────────

  describe('POST /api/v1/admin/customers', () => {
    it('stamps the created customer with the requesting distributor id', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/customers')
        .set('x-distributor-id', DIST_A)
        .send({ name: 'New Customer' });

      expect(res.status).toBe(201);
      expect(res.body.distributorId).toBe(DIST_A);

      const inDb = await prisma.tradeRelationship.findUnique({ where: { id: res.body.id } });
      expect(inDb?.distributorId).toBe(DIST_A);
    });
  });

  // ── PATCH /admin/customers/:id ─────────────────────────────────────────────

  describe('PATCH /api/v1/admin/customers/:id', () => {
    it('returns 404 and leaves customer unchanged when it belongs to a different distributor', async () => {
      const relB = await createCustomer(DIST_B, 'Original Name');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/customers/${relB.id}`)
        .set('x-distributor-id', DIST_A)
        .send({ notes: 'Stolen update' });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /admin/customers/:id ────────────────────────────────────────────

  describe('DELETE /api/v1/admin/customers/:id', () => {
    it('returns 404 and does not soft-delete when customer belongs to different distributor', async () => {
      const relB = await createCustomer(DIST_B);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/customers/${relB.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(404);

      const inDb = await prisma.tradeRelationship.findUnique({ where: { id: relB.id } });
      expect(inDb?.deletedAt).toBeNull();
    });

    it('soft-deletes and returns 204 for the correct distributor', async () => {
      const relA = await createCustomer(DIST_A);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/customers/${relA.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(204);

      const inDb = await prisma.tradeRelationship.findUnique({ where: { id: relA.id } });
      expect(inDb?.deletedAt).not.toBeNull();
    });
  });
});
