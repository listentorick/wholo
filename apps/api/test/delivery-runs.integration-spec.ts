/**
 * Integration tests for the Delivery Runs board (M3a — read path only; the
 * mutation tests 2-8 & 10 land with M3b). Proves two things a mocked-Prisma
 * unit test cannot: real cross-tenant scoping on the board read, and that
 * the read path genuinely never creates a DeliveryRun row (the whole point
 * of using a plain findMany instead of findOrCreateRun on GET).
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrderStatus, OrganisationType, Prisma, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-delivery-runs-dist-a';
const DIST_B = 'test-delivery-runs-dist-b';
const CUSTOMER_1 = 'test-delivery-runs-customer-1';
const ADMIN_USER = 'test-delivery-runs-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-delivery-runs-admin';

const DELIVERY_DATE = '2026-08-25';

describe('Delivery Runs board (integration)', () => {
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
      create: { id: DIST_A, name: 'Delivery Runs Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Delivery Runs Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_1 },
      create: { id: CUSTOMER_1, name: 'Blackbird Kitchen', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'delivery-runs-admin@integration.test',
        keycloakId: ADMIN_KEYCLOAK_ID,
        firstName: 'Integration',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'delivery-runs-admin@integration.test' });
  });

  afterEach(async () => {
    await prisma.deliveryRunOrder.deleteMany({ where: { run: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.deliveryRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.deliveryRouteCustomer.deleteMany({ where: { route: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.deliveryRoute.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER_1] } } });
    await app.close();
    await jwtServer.close();
  });

  const createRoute = (distributorId: string, name: string) => prisma.deliveryRoute.create({
    data: { distributorId, name },
  });

  const createOrder = async (distributorId: string, traderCustomerId: string, overrides: Record<string, unknown> = {}) => {
    const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const orderNumber = `TEST-DRUN-${seqResult[0].nextval}`;
    return prisma.order.create({
      data: {
        distributorId,
        traderCustomerId,
        placedByUserId: ADMIN_USER,
        orderNumber,
        currency: 'GBP',
        status: OrderStatus.ACCEPTED,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('100.00'),
        submittedAt: new Date(),
        acceptedAt: new Date(),
        requestedDeliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`),
        scheduledDeliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`),
        ...overrides,
      },
    });
  };

  describe('tenancy read (a distributor never sees another distributor\'s board)', () => {
    it('never includes distributor B\'s runs or unassigned orders in distributor A\'s board', async () => {
      const orderA = await createOrder(DIST_A, CUSTOMER_1);
      const runB = await prisma.deliveryRun.create({
        data: { distributorId: DIST_B, deliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`), name: 'B Local' },
      });
      const orderB = await createOrder(DIST_B, CUSTOMER_1);
      await prisma.deliveryRunOrder.create({
        data: {
          runId: runB.id,
          orderId: orderB.id,
          allocationSource: 'MANUAL',
          assignedByUserId: ADMIN_USER,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-days/${DELIVERY_DATE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.runs.every((r: { runId: string }) => r.runId !== runB.id)).toBe(true);
      expect(res.body.unassigned.map((c: { orderId: string }) => c.orderId)).toContain(orderA.id);
      expect(res.body.unassigned.map((c: { orderId: string }) => c.orderId)).not.toContain(orderB.id);
    });

    it('rejects reading another distributor\'s board entirely (DistributorAccessGuard)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B}/delivery-days/${DELIVERY_DATE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('read path creates nothing', () => {
    it('GET delivery-days/:date never creates a DeliveryRun row, even when a route exists with no run yet', async () => {
      const route = await createRoute(DIST_A, 'Yorkshire');
      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: route.id,
          customerId: CUSTOMER_1,
          defaultDropPosition: 1,
          assignedByUserId: ADMIN_USER,
        },
      });
      await createOrder(DIST_A, CUSTOMER_1);

      const countBefore = await prisma.deliveryRun.count({ where: { distributorId: DIST_A } });
      expect(countBefore).toBe(0);

      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-days/${DELIVERY_DATE}`)
        .set('Authorization', `Bearer ${token}`);
      const res2 = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-days/${DELIVERY_DATE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.unassigned).toHaveLength(1);
      expect(res1.body.unassigned[0].unallocatedReason).toBeNull(); // route exists, no run yet — allocatable

      const countAfter = await prisma.deliveryRun.count({ where: { distributorId: DIST_A } });
      expect(countAfter).toBe(0);
    });
  });

  describe('GET delivery-days (workload strip)', () => {
    it('counts an unassigned ACCEPTED order in its window and pads every date, including zero-count days', async () => {
      await createOrder(DIST_A, CUSTOMER_1);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-days?from=2026-08-24&to=2026-08-26`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.map((d: { date: string }) => d.date)).toEqual(['2026-08-24', '2026-08-25', '2026-08-26']);
      const day = res.body.data.find((d: { date: string }) => d.date === DELIVERY_DATE);
      expect(day).toEqual({ date: DELIVERY_DATE, runCount: 0, stopCount: 1, unassignedCount: 1 });
    });

    it('rejects a window wider than 31 days as a 400', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-days?from=2026-08-01&to=2026-09-15`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });
});
