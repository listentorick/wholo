/**
 * Integration tests for admin orders endpoints.
 * Verifies multi-tenancy isolation against a real database.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, OrderStatus, OrderLineStatus, Prisma, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-orders-dist-a';
const DIST_B = 'test-orders-dist-b';
const USER_A = 'test-orders-user-a';
const USER_A_KEYCLOAK_ID = 'kc-test-orders-user-a';

describe('Admin Orders (integration)', () => {
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
      create: { id: DIST_A, name: 'Orders Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Orders Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: USER_A },
      create: {
        id: USER_A,
        email: 'orders-admin@integration.test',
        keycloakId: USER_A_KEYCLOAK_ID,
        firstName: 'Orders',
        lastName: 'Admin',
      },
      update: { keycloakId: USER_A_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: USER_A_KEYCLOAK_ID, email: 'orders-admin@integration.test' });
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'Order', aggregateId: { in: await prisma.order.findMany({ where: { distributorId: { in: [DIST_A, DIST_B] } }, select: { id: true } }).then((rows) => rows.map((r) => r.id)) } } });
    await prisma.orderLine.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: USER_A } });
    await prisma.user.deleteMany({ where: { id: USER_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany({
      where: {
        aggregateId: {
          in: await prisma.order
            .findMany({ where: { distributorId: { in: [DIST_A, DIST_B] } }, select: { id: true } })
            .then((rows) => rows.map((r) => r.id)),
        },
      },
    });
    await prisma.orderLine.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  const createOrder = async (distributorId: string, status: OrderStatus = OrderStatus.SUBMITTED) => {
    const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const orderNumber = `TEST-ORD-${seqResult[0].nextval}`;

    return prisma.order.create({
      data: {
        distributorId,
        traderCustomerId: distributorId,
        placedByUserId: USER_A,
        orderNumber,
        currency: 'GBP',
        status,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('100.00'),
        submittedAt: new Date(),
      },
    });
  };

  // ── GET /admin/distributors/:distributorId/orders ──────────────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/orders', () => {
    it('returns only the requesting distributor\'s orders', async () => {
      const orderA = await createOrder(DIST_A);
      await createOrder(DIST_B);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(orderA.id);
    });

    it('returns 403 when requesting a distributor the caller has no membership for', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_B}/orders`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/distributors/:distributorId/orders/:id ──────────────────────

  describe('GET /api/v1/admin/distributors/:distributorId/orders/:id', () => {
    it('returns the order for the correct distributor', async () => {
      const orderA = await createOrder(DIST_A);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${orderA.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(orderA.id);
    });

    it('returns 404 when the order belongs to a distributor other than the one in the path, even if the order id is guessed correctly', async () => {
      // This exercises the service-level ownership check, distinct from the guard:
      // the caller IS authorized for DIST_A (passes the guard), but orderB does not
      // belong to DIST_A, so the service must still reject it.
      const orderB = await createOrder(DIST_B);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${orderB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /admin/distributors/:distributorId/orders/:id/accept ──────────────

  describe('POST /api/v1/admin/distributors/:distributorId/orders/:id/accept', () => {
    it('transitions order to ACCEPTED and records the acting user', async () => {
      const order = await createOrder(DIST_A, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/accept`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(OrderStatus.ACCEPTED);

      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.ACCEPTED);
      expect(inDb?.acceptedByUserId).toBe(USER_A);
    });

    it('returns 422 when order is not in SUBMITTED status', async () => {
      const order = await createOrder(DIST_A, OrderStatus.ACCEPTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/accept`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
    });
  });

  // ── POST /admin/distributors/:distributorId/orders/:id/reject ──────────────

  describe('POST /api/v1/admin/distributors/:distributorId/orders/:id/reject', () => {
    it('transitions order to REJECTED', async () => {
      const order = await createOrder(DIST_A, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Out of stock' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(OrderStatus.REJECTED);

      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.REJECTED);
      expect(inDb?.rejectionReason).toBe('Out of stock');
    });

    it('returns 404 when order belongs to a different distributor than the one in the path', async () => {
      const orderB = await createOrder(DIST_B);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${orderB.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Not mine' });

      expect(res.status).toBe(404);
    });
  });

  // ── POST /admin/distributors/:distributorId/orders/:id/cancel ──────────────

  describe('POST /api/v1/admin/distributors/:distributorId/orders/:id/cancel', () => {
    it('cancels a SUBMITTED order', async () => {
      const order = await createOrder(DIST_A, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Customer request' });

      expect(res.status).toBe(200);
      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.CANCELLED);
    });

    it('cancels an ACCEPTED order', async () => {
      const order = await createOrder(DIST_A, OrderStatus.ACCEPTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Logistics issue' });

      expect(res.status).toBe(200);
      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.CANCELLED);
    });

    it('returns 403 and does not cancel when caller has no membership for the order\'s distributor', async () => {
      const orderB = await createOrder(DIST_B, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_B}/orders/${orderB.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Attempted theft' });

      expect(res.status).toBe(403);
      const inDb = await prisma.order.findUnique({ where: { id: orderB.id } });
      expect(inDb?.status).toBe(OrderStatus.SUBMITTED);
    });
  });
});
