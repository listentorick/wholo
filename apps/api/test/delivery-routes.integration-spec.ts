/**
 * Integration tests for delivery-routes: verifies DistributorAccessGuard
 * enforcement (ownership/tenancy) against a real JWKS-validated JWT, and
 * that the two ADR-052 marker-column + trigger constraints introduced by
 * the add_delivery_routes_and_runs migration are actually enforced at the
 * database level — something a mocked-Prisma unit test cannot prove. Both
 * constraint tests insert directly via raw Prisma, bypassing
 * DeliveryRoutesService entirely, per ADR-052's own required test pattern
 * (a raw insert that doesn't know the marker column exists must still be
 * unable to violate the "one active row" rule).
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import {
  DeliveryAllocationSource,
  OrderStatus,
  OrganisationType,
  Prisma,
  Role,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-delivery-routes-dist-a';
const DIST_B = 'test-delivery-routes-dist-b';
const CUSTOMER_1 = 'test-delivery-routes-customer-1';
const ADMIN_USER = 'test-delivery-routes-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-delivery-routes-admin';

describe('Delivery Routes (integration)', () => {
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
      create: { id: DIST_A, name: 'Delivery Routes Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Delivery Routes Test Distributor B', type: OrganisationType.DISTRIBUTOR },
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
        email: 'delivery-routes-admin@integration.test',
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

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'delivery-routes-admin@integration.test' });
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

  const createOrder = async (distributorId: string) => {
    const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const orderNumber = `TEST-DR-${seqResult[0].nextval}`;
    return prisma.order.create({
      data: {
        distributorId,
        traderCustomerId: distributorId,
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
      },
    });
  };

  describe('DistributorAccessGuard', () => {
    it('allows listing routes for the distributor the admin belongs to', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-routes`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('rejects listing routes for a distributor the admin does not belong to', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B}/delivery-routes`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('rejects requests with no Authorization header at all', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/distributors/${DIST_A}/delivery-routes`,
      );

      expect(res.status).toBe(401);
    });
  });

  describe('ownership (a distributor can only reach its own routes)', () => {
    it('returns 404 for a route id that belongs to a different distributor', async () => {
      const routeB = await createRoute(DIST_B, 'Other distributor route');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-routes/${routeB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('does not include another distributor\'s routes in the list response', async () => {
      await createRoute(DIST_A, 'Yorkshire');
      await createRoute(DIST_B, 'Other distributor route');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-routes`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((route: { distributorId: string }) => route.distributorId === DIST_A)).toBe(true);
    });
  });

  describe('one active default route per customer per distributor (DB-level trigger + unique constraint)', () => {
    it('rejects a second active route assignment for the same customer in the same distributor', async () => {
      const routeA1 = await createRoute(DIST_A, 'Local');
      const routeA2 = await createRoute(DIST_A, 'Yorkshire');

      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: routeA1.id,
          customerId: CUSTOMER_1,
          defaultDropPosition: 1,
          assignedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.deliveryRouteCustomer.create({
          data: {
            routeId: routeA2.id,
            customerId: CUSTOMER_1,
            defaultDropPosition: 1,
            assignedByUserId: ADMIN_USER,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('sets the marker column from the real columns without the caller mentioning it', async () => {
      const routeA1 = await createRoute(DIST_A, 'Local');

      const created = await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: routeA1.id,
          customerId: CUSTOMER_1,
          defaultDropPosition: 1,
          assignedByUserId: ADMIN_USER,
        },
      });

      expect(created.activeDistributorCustomerId).toBe(`${DIST_A}:${CUSTOMER_1}`);
    });

    it('allows a removed (soft-ended) assignment to coexist with a new active one', async () => {
      const routeA1 = await createRoute(DIST_A, 'Local');
      const routeA2 = await createRoute(DIST_A, 'Yorkshire');

      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: routeA1.id,
          customerId: CUSTOMER_1,
          defaultDropPosition: 1,
          assignedByUserId: ADMIN_USER,
          removedAt: new Date(),
          removedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.deliveryRouteCustomer.create({
          data: {
            routeId: routeA2.id,
            customerId: CUSTOMER_1,
            defaultDropPosition: 1,
            assignedByUserId: ADMIN_USER,
          },
        }),
      ).resolves.toBeDefined();
    });

    it('allows the same customerId to have an independent active route in a different distributor', async () => {
      const routeA1 = await createRoute(DIST_A, 'Local');
      const routeB1 = await createRoute(DIST_B, 'Local B');

      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: routeA1.id,
          customerId: CUSTOMER_1,
          defaultDropPosition: 1,
          assignedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.deliveryRouteCustomer.create({
          data: {
            routeId: routeB1.id,
            customerId: CUSTOMER_1,
            defaultDropPosition: 1,
            assignedByUserId: ADMIN_USER,
          },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('an order has at most one active run allocation (DB-level trigger + unique constraint)', () => {
    it('rejects a second active DeliveryRunOrder for the same order', async () => {
      const order = await createOrder(DIST_A);
      const runA1 = await prisma.deliveryRun.create({
        data: { distributorId: DIST_A, deliveryDate: new Date('2026-08-20'), name: 'Local' },
      });
      const runA2 = await prisma.deliveryRun.create({
        data: { distributorId: DIST_A, deliveryDate: new Date('2026-08-21'), name: 'Local' },
      });

      await prisma.deliveryRunOrder.create({
        data: {
          runId: runA1.id,
          orderId: order.id,
          allocationSource: DeliveryAllocationSource.DEFAULT_ROUTE,
          assignedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.deliveryRunOrder.create({
          data: {
            runId: runA2.id,
            orderId: order.id,
            allocationSource: DeliveryAllocationSource.MANUAL,
            assignedByUserId: ADMIN_USER,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('sets the marker column from orderId without the caller mentioning it', async () => {
      const order = await createOrder(DIST_A);
      const run = await prisma.deliveryRun.create({
        data: { distributorId: DIST_A, deliveryDate: new Date('2026-08-20'), name: 'Local' },
      });

      const created = await prisma.deliveryRunOrder.create({
        data: {
          runId: run.id,
          orderId: order.id,
          allocationSource: DeliveryAllocationSource.DEFAULT_ROUTE,
          assignedByUserId: ADMIN_USER,
        },
      });

      expect(created.activeOrderId).toBe(order.id);
    });

    it('allows a removed (soft-ended) allocation to coexist with a new active one', async () => {
      const order = await createOrder(DIST_A);
      const runA1 = await prisma.deliveryRun.create({
        data: { distributorId: DIST_A, deliveryDate: new Date('2026-08-20'), name: 'Local' },
      });
      const runA2 = await prisma.deliveryRun.create({
        data: { distributorId: DIST_A, deliveryDate: new Date('2026-08-21'), name: 'Local' },
      });

      await prisma.deliveryRunOrder.create({
        data: {
          runId: runA1.id,
          orderId: order.id,
          allocationSource: DeliveryAllocationSource.DEFAULT_ROUTE,
          assignedByUserId: ADMIN_USER,
          removedAt: new Date(),
          removedByUserId: ADMIN_USER,
        },
      });

      await expect(
        prisma.deliveryRunOrder.create({
          data: {
            runId: runA2.id,
            orderId: order.id,
            allocationSource: DeliveryAllocationSource.MANUAL,
            assignedByUserId: ADMIN_USER,
          },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('customer assignment endpoints', () => {
    it('assigns a customer, lists it in drop order, then removes it', async () => {
      const route = await createRoute(DIST_A, 'Local');

      const assignRes = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-routes/${route.id}/customers`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: CUSTOMER_1 });
      expect(assignRes.status).toBe(201);
      expect(assignRes.body.customerId).toBe(CUSTOMER_1);
      expect(assignRes.body.defaultDropPosition).toBe(1);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-routes/${route.id}/customers`)
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);

      const removeRes = await request(app.getHttpServer())
        .delete(`/api/v1/distributors/${DIST_A}/delivery-routes/${route.id}/customers/${CUSTOMER_1}`)
        .set('Authorization', `Bearer ${token}`);
      expect(removeRes.status).toBe(204);

      const afterRemove = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-routes/${route.id}/customers`)
        .set('Authorization', `Bearer ${token}`);
      expect(afterRemove.body).toHaveLength(0);
    });

    it('rejects assigning a customer that already has an active route via the HTTP layer', async () => {
      const routeA1 = await createRoute(DIST_A, 'Local');
      const routeA2 = await createRoute(DIST_A, 'Yorkshire');

      await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-routes/${routeA1.id}/customers`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: CUSTOMER_1 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-routes/${routeA2.id}/customers`)
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId: CUSTOMER_1 });

      expect(res.status).toBe(400);
    });
  });
});
