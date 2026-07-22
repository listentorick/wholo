/**
 * Integration tests for the dashboard analytics endpoints (Phase 1).
 * Verifies tenant isolation and reconciliation against a real database.
 * The analytics-facts write path (order_analytics_state population) is
 * proved separately in analytics-facts.integration-spec.ts — here the fact
 * tables are seeded directly so these tests focus purely on the read path.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrganisationType, Prisma, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-analytics-dist-a';
const DIST_B = 'test-analytics-dist-b';
const CUSTOMER_A1 = 'test-analytics-cust-a1';
const CUSTOMER_A2 = 'test-analytics-cust-a2';
const PRODUCT_A1 = 'test-analytics-product-a1';
const USER_A = 'test-analytics-user-a';
const USER_A_KEYCLOAK_ID = 'kc-test-analytics-user-a';

describe('Analytics (integration)', () => {
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
      create: { id: DIST_A, name: 'Analytics Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.distributorSettings.upsert({
      where: { distributorId: DIST_A },
      create: { distributorId: DIST_A, timezone: 'UTC' },
      update: { timezone: 'UTC' },
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Analytics Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_A1 },
      create: { id: CUSTOMER_A1, name: 'Analytics Test Customer 1', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_A2 },
      create: { id: CUSTOMER_A2, name: 'Analytics Test Customer 2', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    await prisma.product.upsert({
      where: { id: PRODUCT_A1 },
      create: { id: PRODUCT_A1, distributorId: DIST_A, name: 'Analytics Test Product', status: 'ACTIVE' },
      update: {},
    });

    const user = await prisma.user.upsert({
      where: { id: USER_A },
      create: {
        id: USER_A,
        email: 'analytics-admin@integration.test',
        keycloakId: USER_A_KEYCLOAK_ID,
        firstName: 'Analytics',
        lastName: 'Admin',
      },
      update: { keycloakId: USER_A_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });

    token = jwtServer.signToken({ sub: USER_A_KEYCLOAK_ID, email: 'analytics-admin@integration.test' });
  });

  afterAll(async () => {
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderLineFact.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { id: PRODUCT_A1 } });
    await prisma.membership.deleteMany({ where: { userId: USER_A } });
    await prisma.user.deleteMany({ where: { id: USER_A } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER_A1, CUSTOMER_A2] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(async () => {
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderLineFact.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  const seedOrderState = (overrides: Partial<Prisma.OrderAnalyticsStateUncheckedCreateInput> & { orderId: string }) =>
    prisma.orderAnalyticsState.create({
      data: {
        distributorId: DIST_A,
        traderCustomerId: CUSTOMER_A1,
        status: 'ACCEPTED',
        subtotalAmount: new Prisma.Decimal('100.00'),
        distributorLocalDate: new Date('2026-03-15T00:00:00.000Z'),
        lastEventAt: new Date('2026-03-15T10:00:00.000Z'),
        ...overrides,
      },
    });

  describe('GET /api/v1/distributors/:distributorId/order-summary', () => {
    it("returns only the requesting distributor's totals", async () => {
      await seedOrderState({ orderId: 'test-analytics-order-a1', subtotalAmount: new Prisma.Decimal('100.00') });
      await prisma.orderAnalyticsState.create({
        data: {
          orderId: 'test-analytics-order-b1',
          distributorId: DIST_B,
          traderCustomerId: CUSTOMER_A1,
          status: 'ACCEPTED',
          subtotalAmount: new Prisma.Decimal('99999.00'),
          distributorLocalDate: new Date('2026-03-15T00:00:00.000Z'),
          lastEventAt: new Date('2026-03-15T10:00:00.000Z'),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/order-summary`)
        .query({ period: 'custom', start: '2026-03-15', end: '2026-03-15' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.metrics.orderValue.current).toBe(100);
    });

    it("returns 403 when requesting a distributor the caller has no membership for", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_B}/order-summary`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('reconciles to a hand-computed sum for a fixed fixture set', async () => {
      await seedOrderState({ orderId: 'test-analytics-order-a2', subtotalAmount: new Prisma.Decimal('150.50') });
      await seedOrderState({ orderId: 'test-analytics-order-a3', traderCustomerId: CUSTOMER_A2, subtotalAmount: new Prisma.Decimal('49.50') });
      // A rejected order must not count toward qualifying value.
      await seedOrderState({ orderId: 'test-analytics-order-a4', status: 'REJECTED', subtotalAmount: new Prisma.Decimal('1000.00') });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/order-summary`)
        .query({ period: 'custom', start: '2026-03-15', end: '2026-03-15' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.metrics.orderValue.current).toBe(200); // 150.50 + 49.50, rejected excluded
      expect(res.body.metrics.orderCount.current).toBe(2);
      expect(res.body.metrics.purchasingCustomers.current).toBe(2);
    });
  });

  describe('GET /api/v1/distributors/:distributorId/customer-rankings', () => {
    it("does not leak distributor B's customers into distributor A's rankings", async () => {
      await seedOrderState({ orderId: 'test-analytics-order-a5' });
      await prisma.orderAnalyticsState.create({
        data: {
          orderId: 'test-analytics-order-b2',
          distributorId: DIST_B,
          traderCustomerId: 'some-other-customer',
          status: 'ACCEPTED',
          subtotalAmount: new Prisma.Decimal('500.00'),
          distributorLocalDate: new Date('2026-03-15T00:00:00.000Z'),
          lastEventAt: new Date('2026-03-15T10:00:00.000Z'),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/customer-rankings`)
        .query({ period: 'custom', start: '2026-03-15', end: '2026-03-15' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.customers).toHaveLength(1);
      expect(res.body.customers[0].customerId).toBe(CUSTOMER_A1);
    });
  });

  describe('GET /api/v1/distributors/:distributorId/product-rankings', () => {
    it('lists an enabled product with no qualifying sales as non-selling', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/product-rankings`)
        .query({ period: 'custom', start: '2026-03-15', end: '2026-03-15' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.nonSellingProducts.map((p: { productId: string }) => p.productId)).toContain(PRODUCT_A1);
    });
  });
});
