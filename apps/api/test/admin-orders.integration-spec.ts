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
import { OrganisationType, OrderStatus, OrderLineStatus, Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';

const DIST_A = 'test-orders-dist-a';
const DIST_B = 'test-orders-dist-b';
const USER_A = 'test-orders-user-a';

describe('Admin Orders (integration)', () => {
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
      create: { id: DIST_A, name: 'Orders Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Orders Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'Order', aggregateId: { in: await prisma.order.findMany({ where: { distributorId: { in: [DIST_A, DIST_B] } }, select: { id: true } }).then((rows) => rows.map((r) => r.id)) } } });
    await prisma.orderLine.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
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

  // ── GET /admin/orders ──────────────────────────────────────────────────────

  describe('GET /api/v1/admin/orders', () => {
    it('returns only the requesting distributor\'s orders', async () => {
      const orderA = await createOrder(DIST_A);
      await createOrder(DIST_B);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(orderA.id);
    });
  });

  // ── GET /admin/orders/:id ──────────────────────────────────────────────────

  describe('GET /api/v1/admin/orders/:id', () => {
    it('returns 404 when order belongs to a different distributor', async () => {
      const orderB = await createOrder(DIST_B);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/orders/${orderB.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(404);
    });

    it('returns the order for the correct distributor', async () => {
      const orderA = await createOrder(DIST_A);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/orders/${orderA.id}`)
        .set('x-distributor-id', DIST_A);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(orderA.id);
    });
  });

  // ── POST /admin/orders/:id/accept ──────────────────────────────────────────

  describe('POST /api/v1/admin/orders/:id/accept', () => {
    it('transitions order to ACCEPTED and records the acting user', async () => {
      const order = await createOrder(DIST_A, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/accept`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(OrderStatus.ACCEPTED);

      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.ACCEPTED);
      expect(inDb?.acceptedByUserId).toBe(USER_A);
    });

    it('returns 404 when order belongs to a different distributor', async () => {
      const orderB = await createOrder(DIST_B);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${orderB.id}/accept`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A);

      expect(res.status).toBe(404);
      const inDb = await prisma.order.findUnique({ where: { id: orderB.id } });
      expect(inDb?.status).toBe(OrderStatus.SUBMITTED);
    });

    it('returns 422 when order is not in SUBMITTED status', async () => {
      const order = await createOrder(DIST_A, OrderStatus.ACCEPTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/accept`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A);

      expect(res.status).toBe(422);
    });
  });

  // ── POST /admin/orders/:id/reject ──────────────────────────────────────────

  describe('POST /api/v1/admin/orders/:id/reject', () => {
    it('transitions order to REJECTED', async () => {
      const order = await createOrder(DIST_A, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/reject`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A)
        .send({ reason: 'Out of stock' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(OrderStatus.REJECTED);

      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.REJECTED);
      expect(inDb?.rejectionReason).toBe('Out of stock');
    });

    it('returns 404 when order belongs to a different distributor', async () => {
      const orderB = await createOrder(DIST_B);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${orderB.id}/reject`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A)
        .send({ reason: 'Not mine' });

      expect(res.status).toBe(404);
    });
  });

  // ── POST /admin/orders/:id/cancel ──────────────────────────────────────────

  describe('POST /api/v1/admin/orders/:id/cancel', () => {
    it('cancels a SUBMITTED order', async () => {
      const order = await createOrder(DIST_A, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/cancel`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A)
        .send({ reason: 'Customer request' });

      expect(res.status).toBe(200);
      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.CANCELLED);
    });

    it('cancels an ACCEPTED order', async () => {
      const order = await createOrder(DIST_A, OrderStatus.ACCEPTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order.id}/cancel`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A)
        .send({ reason: 'Logistics issue' });

      expect(res.status).toBe(200);
      const inDb = await prisma.order.findUnique({ where: { id: order.id } });
      expect(inDb?.status).toBe(OrderStatus.CANCELLED);
    });

    it('returns 404 and does not cancel when order belongs to different distributor', async () => {
      const orderB = await createOrder(DIST_B, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${orderB.id}/cancel`)
        .set('x-distributor-id', DIST_A)
        .set('x-user-id', USER_A)
        .send({ reason: 'Attempted theft' });

      expect(res.status).toBe(404);
      const inDb = await prisma.order.findUnique({ where: { id: orderB.id } });
      expect(inDb?.status).toBe(OrderStatus.SUBMITTED);
    });
  });
});
