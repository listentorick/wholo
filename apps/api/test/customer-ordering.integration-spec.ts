/**
 * Integration tests for GET distributors/:distributorId/customers/:customerId/ordering-behaviour
 * (ADR-077): a customer shared by two distributors gets only each
 * distributor's own orders and products counted, only qualifying orders
 * count, and the endpoint needs analytics:read.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrderStatus, OrganisationType, Prisma, Role, TradeRelationshipStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-custord-dist-a';
const DIST_B = 'test-custord-dist-b';
const CUSTOMER = 'test-custord-customer';
const NEW_CUSTOMER = 'test-custord-new-customer';
const DISTS = [DIST_A, DIST_B];
const CUSTOMERS = [CUSTOMER, NEW_CUSTOMER];
const NOW = new Date('2035-01-31T12:00:00.000Z'); // period 2035-01-02 … 2035-01-31

type Fixture = { id: string; kc: string; email: string; role: Role; org: string };
const ADMIN_A: Fixture = { id: 'test-custord-admin-a', kc: 'kc-test-custord-admin-a', email: 'admin-a@custord.integration.test', role: Role.DISTRIBUTOR_ADMIN, org: DIST_A };
const WAREHOUSE_A: Fixture = { id: 'test-custord-wh-a', kc: 'kc-test-custord-wh-a', email: 'wh-a@custord.integration.test', role: Role.WAREHOUSE_STAFF, org: DIST_A };
const USERS = [ADMIN_A, WAREHOUSE_A];

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Customer ordering behaviour (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  const tokens: Record<string, string> = {};

  const get = (distributorId: string, customerId: string, as?: Fixture) => {
    const req = request(app.getHttpServer()).get(`/api/v1/distributors/${distributorId}/customers/${customerId}/ordering-behaviour`);
    return as ? req.set('Authorization', `Bearer ${tokens[as.id]}`) : req;
  };

  // An order (analytics state) with one line fact per product.
  const order = async (distributorId: string, customerId: string, orderId: string, on: string, subtotal: string, products: string[], status: OrderStatus = OrderStatus.COMPLETED) => {
    await prisma.orderAnalyticsState.create({
      data: { orderId, distributorId, traderCustomerId: customerId, status, subtotalAmount: new Prisma.Decimal(subtotal), distributorLocalDate: day(on), lastEventAt: new Date(`${on}T09:00:00.000Z`) },
    });
    for (const productId of products) {
      await prisma.orderLineFact.create({
        data: {
          eventId: `ev-${orderId}-${productId}`, orderLineId: `ln-${orderId}-${productId}`, distributorId, orderId, productId, traderCustomerId: customerId,
          quantity: 1, netValue: new Prisma.Decimal('10.00'), occurredAt: new Date(`${on}T09:00:00.000Z`), distributorLocalDate: day(on),
        },
      });
    }
  };

  beforeAll(async () => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
        'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    jwtServer = await startJwtTestServer();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await teardownData();
    for (const id of DISTS) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name: `CustOrd ${id}`, type: OrganisationType.DISTRIBUTOR }, update: {} });
      await prisma.distributorSettings.upsert({ where: { distributorId: id }, create: { distributorId: id, timezone: 'UTC' }, update: { timezone: 'UTC' } });
    }
    for (const id of CUSTOMERS) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name: `CustOrd ${id}`, type: OrganisationType.TRADE_CUSTOMER }, update: {} });
    }
    for (const u of USERS) {
      const user = await prisma.user.upsert({
        where: { id: u.id },
        create: { id: u.id, email: u.email, keycloakId: u.kc, firstName: 'Test', lastName: u.role },
        update: { keycloakId: u.kc, deletedAt: null },
      });
      const membership = await prisma.membership.upsert({
        where: { userId_organisationId: { userId: user.id, organisationId: u.org } },
        create: { userId: user.id, organisationId: u.org, role: u.role },
        update: { role: u.role },
      });
      await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      await prisma.membershipRole.create({ data: { membershipId: membership.id, role: u.role } });
      tokens[u.id] = jwtServer.signToken({ sub: u.kc, email: u.email });
    }
    for (const distributorId of DISTS) {
      await prisma.tradeRelationship.create({ data: { distributorId, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE } });
    }
    await prisma.tradeRelationship.create({ data: { distributorId: DIST_A, customerId: NEW_CUSTOMER, status: TradeRelationshipStatus.ACTIVE } });

    // Distributor A: ordering since well before the previous period.
    await order(DIST_A, CUSTOMER, 'test-custord-a-old', '2034-10-01', '100.00', ['p-old']);
    await order(DIST_A, CUSTOMER, 'test-custord-a-prev', '2034-12-15', '200.00', ['p-1']); // previous period
    await order(DIST_A, CUSTOMER, 'test-custord-a-1', '2035-01-10', '300.00', ['p-1', 'p-2']);
    await order(DIST_A, CUSTOMER, 'test-custord-a-2', '2035-01-23', '200.00', ['p-2', 'p-3']);
    await order(DIST_A, CUSTOMER, 'test-custord-a-rejected', '2035-01-29', '5000.00', ['p-9'], OrderStatus.REJECTED); // never counts
    // Distributor B's orders from the same customer — must never appear in A's figures.
    await order(DIST_B, CUSTOMER, 'test-custord-b-1', '2035-01-30', '9999.00', ['p-b1', 'p-b2']);
    // A customer who only started ordering this month.
    await order(DIST_A, NEW_CUSTOMER, 'test-custord-new-1', '2035-01-20', '50.00', ['p-1']);
  });

  async function teardownData() {
    await prisma.orderLineFact.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: DISTS } } });
  }

  afterAll(async () => {
    await teardownData();
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: USERS.map((u) => u.id) } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: USERS.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: USERS.map((u) => u.id) } } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [...DISTS, ...CUSTOMERS] } } });
    await app.close();
    await jwtServer.close();
    jest.useRealTimers();
  });

  it("counts only this distributor's qualifying orders in the last 30 days", async () => {
    const res = await get(DIST_A, CUSTOMER, ADMIN_A);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      customerId: CUSTOMER,
      asOf: '2035-01-31',
      periodDays: 30,
      periodStart: '2035-01-02',
      periodEnd: '2035-01-31',
      recency: { lastOrderDate: '2035-01-23', daysSinceLastOrder: 8 },
      frequency: { orders: 2 },
      monetary: { amounts: [{ currency: 'GBP', amount: 500 }] },
      productBreadth: { distinctProducts: 3 },
      trend: 'up', // 500 against 200 the period before
    });
  });

  it('has not enough history for a trend when the customer started ordering this period', async () => {
    const res = await get(DIST_A, NEW_CUSTOMER, ADMIN_A);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ frequency: { orders: 1 }, trend: 'insufficient_history' });
  });

  it("refuses another distributor's view of the same customer", async () => {
    expect((await get(DIST_B, CUSTOMER, ADMIN_A)).status).toBe(403);
  });

  it("404s for an organisation that is not this distributor's customer", async () => {
    expect((await get(DIST_A, DIST_B, ADMIN_A)).status).toBe(404);
  });

  it('refuses staff without analytics:read', async () => {
    expect((await get(DIST_A, CUSTOMER, WAREHOUSE_A)).status).toBe(403);
  });

  it('refuses an unauthenticated request', async () => {
    expect((await get(DIST_A, CUSTOMER)).status).toBe(401);
  });
});
