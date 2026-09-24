/**
 * Customer health, proven against a real database and the real JWT + guard
 * pipeline: a mocked-Prisma unit test can pass the right arguments to the mock
 * without ever proving that a real query enforces the distributor boundary,
 * or that a never-ordered customer really ends up flagged at-risk for the
 * right reason once the full read/roll-up path runs end-to-end.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DeliveryOutcomeType, InvitationStatus, OrderStatus, OrganisationType, Prisma, Role, TradeRelationshipStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-chlt-dist-a';
const DIST_B = 'test-chlt-dist-b';
const CUST_NEVER_A = 'test-chlt-cust-never-a';
const CUST_HEALTHY_A = 'test-chlt-cust-healthy-a';
const CUST_NEVER_B = 'test-chlt-cust-never-b';
const CUST_HEALTHY_B = 'test-chlt-cust-healthy-b';
// Distributor C holds the scenarios for the review fixes, isolated so A's and B's assertions stay simple.
const DIST_C = 'test-chlt-dist-c';
const C_INVITED = 'test-chlt-c-invited'; // created long ago, invitation accepted yesterday
const C_STALE = 'test-chlt-c-stale'; // created long ago, never invited/accepted: the control for C_INVITED
const C_RANGE_REJECTED = 'test-chlt-c-range-rejected';
const C_RANGE_COMPLETED = 'test-chlt-c-range-completed'; // the control: identical history, current orders completed
const C_INACTIVE = 'test-chlt-c-inactive';
const C_RETRY = 'test-chlt-c-retry'; // one delivery failed then was delivered late, two on time
const C_LATE = 'test-chlt-c-late'; // the control: two of three deliveries late
const TZ = 'UTC';
const NOW = new Date('2035-01-10T12:00:00.000Z');

type Fixture = { id: string; kc: string; email: string; role: Role; org: string };
const ADMIN_A: Fixture = { id: 'test-chlt-admin-a', kc: 'kc-test-chlt-admin-a', email: 'admin-a@chlt.integration.test', role: Role.DISTRIBUTOR_ADMIN, org: DIST_A };
const WAREHOUSE_A: Fixture = { id: 'test-chlt-wh-a', kc: 'kc-test-chlt-wh-a', email: 'wh-a@chlt.integration.test', role: Role.WAREHOUSE_STAFF, org: DIST_A };
const ADMIN_B: Fixture = { id: 'test-chlt-admin-b', kc: 'kc-test-chlt-admin-b', email: 'admin-b@chlt.integration.test', role: Role.DISTRIBUTOR_ADMIN, org: DIST_B };
const ADMIN_C: Fixture = { id: 'test-chlt-admin-c', kc: 'kc-test-chlt-admin-c', email: 'admin-c@chlt.integration.test', role: Role.DISTRIBUTOR_ADMIN, org: DIST_C };
const USERS = [ADMIN_A, WAREHOUSE_A, ADMIN_B, ADMIN_C];
const DISTS = [DIST_A, DIST_B, DIST_C];
const C_CUSTOMERS = [C_INVITED, C_STALE, C_RANGE_REJECTED, C_RANGE_COMPLETED, C_INACTIVE, C_RETRY, C_LATE];
const CUSTOMERS = [CUST_NEVER_A, CUST_HEALTHY_A, CUST_NEVER_B, CUST_HEALTHY_B, ...C_CUSTOMERS];

describe('Customer health (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  const tokens: Record<string, string> = {};

  const get = (path: string, as?: Fixture) => {
    const req = request(app.getHttpServer()).get(`/api/v1/distributors/${path}`);
    return as ? req.set('Authorization', `Bearer ${tokens[as.id]}`) : req;
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

    for (const id of DISTS) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name: `Health Test ${id}`, type: OrganisationType.DISTRIBUTOR }, update: {} });
      await prisma.distributorSettings.upsert({ where: { distributorId: id }, create: { distributorId: id, timezone: TZ }, update: { timezone: TZ } });
    }
    for (const id of CUSTOMERS) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name: `Health Customer ${id}`, type: OrganisationType.TRADE_CUSTOMER }, update: {} });
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

    // A relationship well past the never-ordered grace period, with zero orders ever.
    await prisma.tradeRelationship.upsert({
      where: { distributorId_customerId: { distributorId: DIST_A, customerId: CUST_NEVER_A } },
      create: { distributorId: DIST_A, customerId: CUST_NEVER_A, status: TradeRelationshipStatus.ACTIVE, createdAt: new Date('2034-11-01T00:00:00.000Z') },
      update: { status: TradeRelationshipStatus.ACTIVE, deletedAt: null },
    });
    // A relationship with one recent qualifying order — should stay healthy (a single order can't trigger any of the six rules).
    await prisma.tradeRelationship.upsert({
      where: { distributorId_customerId: { distributorId: DIST_A, customerId: CUST_HEALTHY_A } },
      create: { distributorId: DIST_A, customerId: CUST_HEALTHY_A, status: TradeRelationshipStatus.ACTIVE, createdAt: new Date('2034-01-01T00:00:00.000Z') },
      update: { status: TradeRelationshipStatus.ACTIVE, deletedAt: null },
    });
    await prisma.orderAnalyticsState.upsert({
      where: { orderId: 'test-chlt-order-healthy-a' },
      create: {
        orderId: 'test-chlt-order-healthy-a', distributorId: DIST_A, traderCustomerId: CUST_HEALTHY_A, status: OrderStatus.COMPLETED,
        subtotalAmount: new Prisma.Decimal('250.00'), distributorLocalDate: new Date('2035-01-05T00:00:00.000Z'), lastEventAt: new Date('2035-01-05T09:00:00.000Z'),
      },
      update: {},
    });
    // Distributor B has its own buyer with much bigger sales — proves A's sales share never includes B's.
    await prisma.tradeRelationship.upsert({
      where: { distributorId_customerId: { distributorId: DIST_B, customerId: CUST_HEALTHY_B } },
      create: { distributorId: DIST_B, customerId: CUST_HEALTHY_B, status: TradeRelationshipStatus.ACTIVE, createdAt: new Date('2034-01-01T00:00:00.000Z') },
      update: { status: TradeRelationshipStatus.ACTIVE, deletedAt: null },
    });
    await prisma.orderAnalyticsState.upsert({
      where: { orderId: 'test-chlt-order-healthy-b' },
      create: {
        orderId: 'test-chlt-order-healthy-b', distributorId: DIST_B, traderCustomerId: CUST_HEALTHY_B, status: OrderStatus.COMPLETED,
        subtotalAmount: new Prisma.Decimal('999.00'), distributorLocalDate: new Date('2035-01-05T00:00:00.000Z'), lastEventAt: new Date('2035-01-05T09:00:00.000Z'),
      },
      update: {},
    });
    // Same shape as CUST_NEVER_A, but under distributor B — proves isolation.
    await prisma.tradeRelationship.upsert({
      where: { distributorId_customerId: { distributorId: DIST_B, customerId: CUST_NEVER_B } },
      create: { distributorId: DIST_B, customerId: CUST_NEVER_B, status: TradeRelationshipStatus.ACTIVE, createdAt: new Date('2034-11-01T00:00:00.000Z') },
      update: { status: TradeRelationshipStatus.ACTIVE, deletedAt: null },
    });

    // ─── Distributor C: one scenario per review fix ───────────────────────────────
    const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
    const relationship = (customerId: string, status: TradeRelationshipStatus, createdAt: string) =>
      prisma.tradeRelationship.upsert({
        where: { distributorId_customerId: { distributorId: DIST_C, customerId } },
        create: { distributorId: DIST_C, customerId, status, createdAt: day(createdAt) },
        update: { status, deletedAt: null, createdAt: day(createdAt) },
      });
    const order = (orderId: string, customerId: string, status: OrderStatus, value: string, on: string) =>
      prisma.orderAnalyticsState.upsert({
        where: { orderId },
        create: { orderId, distributorId: DIST_C, traderCustomerId: customerId, status, subtotalAmount: new Prisma.Decimal(value), distributorLocalDate: day(on), lastEventAt: new Date(`${on}T09:00:00.000Z`) },
        update: {},
      });
    const lineFacts = async (orderId: string, customerId: string, on: string, products: string[]) => {
      for (const productId of products) {
        await prisma.orderLineFact.create({
          data: { eventId: `ev-${orderId}-${productId}`, orderLineId: `ln-${orderId}-${productId}`, distributorId: DIST_C, orderId, productId, traderCustomerId: customerId, quantity: 1, netValue: new Prisma.Decimal('10.00'), occurredAt: new Date(`${on}T09:00:00.000Z`), distributorLocalDate: day(on) },
        });
      }
    };
    const delivery = (eventId: string, orderId: string, customerId: string, outcome: DeliveryOutcomeType, on: string, committed: string) =>
      prisma.deliveryFact.create({
        data: { eventId, distributorId: DIST_C, orderId, traderCustomerId: customerId, outcome, occurredAt: new Date(`${on}T10:00:00.000Z`), distributorLocalDate: day(on), committedDate: day(committed) },
      });

    // #3 — created 200 days ago; one accepted its invitation yesterday, the control never did.
    await relationship(C_INVITED, TradeRelationshipStatus.ACTIVE, '2034-06-24');
    await prisma.customerInvitation.create({
      data: {
        tradeRelationshipId: (await prisma.tradeRelationship.findFirstOrThrow({ where: { distributorId: DIST_C, customerId: C_INVITED } })).id,
        distributorId: DIST_C, email: 'invited@chlt.integration.test', token: 'test-chlt-invite-token', status: InvitationStatus.ACCEPTED,
        expiresAt: day('2035-02-01'), acceptedAt: new Date('2035-01-09T09:00:00.000Z'),
      },
    });
    await relationship(C_STALE, TradeRelationshipStatus.ACTIVE, '2034-06-24');

    // #6 — 3 SKUs per order in the baseline window, 1 SKU per order now. Only the status of the current orders differs.
    for (const [customerId, currentStatus] of [[C_RANGE_REJECTED, OrderStatus.REJECTED], [C_RANGE_COMPLETED, OrderStatus.COMPLETED]] as const) {
      await relationship(customerId, TradeRelationshipStatus.ACTIVE, '2034-01-01');
      const baseline = [['b1', '2034-11-20'], ['b2', '2034-12-01']];
      const current = [['c1', '2035-01-03'], ['c2', '2035-01-06']];
      for (const [suffix, on] of baseline) {
        await order(`${customerId}-${suffix}`, customerId, OrderStatus.COMPLETED, '100.00', on);
        await lineFacts(`${customerId}-${suffix}`, customerId, on, ['p1', 'p2', 'p3']);
      }
      for (const [suffix, on] of current) {
        await order(`${customerId}-${suffix}`, customerId, currentStatus, '100.00', on);
        await lineFacts(`${customerId}-${suffix}`, customerId, on, ['p1']);
      }
    }

    // #7 — an inactive relationship that still ordered in the last 30 days.
    await relationship(C_INACTIVE, TradeRelationshipStatus.INACTIVE, '2034-01-01');
    await order('inactive-o1', C_INACTIVE, OrderStatus.COMPLETED, '700.00', '2035-01-05');

    // #8 — one delivery failed then was retried and delivered late (two facts, one delivery), two on time.
    await relationship(C_RETRY, TradeRelationshipStatus.ACTIVE, '2034-01-01');
    await order('retry-o1', C_RETRY, OrderStatus.DELIVERED, '50.00', '2035-01-02');
    await delivery('retry-f1', 'retry-o1', C_RETRY, DeliveryOutcomeType.UNABLE_TO_DELIVER, '2035-01-02', '2035-01-02');
    await delivery('retry-f2', 'retry-o1', C_RETRY, DeliveryOutcomeType.DELIVERED, '2035-01-04', '2035-01-02');
    await delivery('retry-f3', 'retry-o2', C_RETRY, DeliveryOutcomeType.DELIVERED, '2035-01-05', '2035-01-05');
    await delivery('retry-f4', 'retry-o3', C_RETRY, DeliveryOutcomeType.DELIVERED, '2035-01-06', '2035-01-06');
    await relationship(C_LATE, TradeRelationshipStatus.ACTIVE, '2034-01-01');
    await order('late-o1', C_LATE, OrderStatus.DELIVERED, '50.00', '2035-01-02');
    await delivery('late-f1', 'late-o1', C_LATE, DeliveryOutcomeType.DELIVERED, '2035-01-04', '2035-01-02');
    await delivery('late-f2', 'late-o2', C_LATE, DeliveryOutcomeType.DELIVERED, '2035-01-06', '2035-01-04');
    await delivery('late-f3', 'late-o3', C_LATE, DeliveryOutcomeType.DELIVERED, '2035-01-06', '2035-01-06');
  });

  afterAll(async () => {
    await prisma.orderLineFact.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.deliveryFact.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.customerInvitation.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: USERS.map((u) => u.id) } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: USERS.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: USERS.map((u) => u.id) } } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [...DISTS, ...CUSTOMERS] } } });
    await app.close();
    await jwtServer.close();
    jest.useRealTimers();
  });

  it('flags the never-ordered customer at-risk with the right reason, and leaves the one-order customer healthy', async () => {
    const res = await get(`${DIST_A}/customer-health`, ADMIN_A);

    expect(res.status).toBe(200);
    expect(res.body.distributorId).toBe(DIST_A);
    expect(res.body.tierCounts).toEqual({ healthy: 1, watch: 0, at_risk: 1 });
    expect(res.body.tiles).toMatchObject({ atRiskCount: 1, activeCustomers90d: 1, salesLast30d: 250 });

    // Where sales come from: the one buyer is the whole 90-day total, so nothing is left over.
    expect(res.body.salesConcentration).toMatchObject({ periodDays: 90, totalValue: 250, top5Share: 1, otherValue: 0, otherShare: 0 });
    expect(res.body.salesConcentration.topCustomers).toEqual([
      expect.objectContaining({ customerId: CUST_HEALTHY_A, customerName: `Health Customer ${CUST_HEALTHY_A}`, tier: 'healthy', value: 250, share: 1 }),
    ]);

    expect(res.body.needingAttention).toHaveLength(1);
    expect(res.body.needingAttention[0]).toMatchObject({
      customerId: CUST_NEVER_A, // the organisation id: what the admin UI's /customers/:id link addresses
      customerName: `Health Customer ${CUST_NEVER_A}`,
      tier: 'at_risk',
      reasons: [expect.objectContaining({ code: 'NEVER_ORDERED', category: 'no_relationship_yet' })],
    });
  });

  it('returns ids that open the customer — every id in the response resolves on the customer endpoint the UI link goes to', async () => {
    const { body } = await get(`${DIST_A}/customer-health`, ADMIN_A);
    const ids = [...body.needingAttention.map((c: { customerId: string }) => c.customerId), ...body.salesConcentration.topCustomers.map((c: { customerId: string }) => c.customerId)];

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect((await get(`${DIST_A}/customers/${id}`, ADMIN_A)).status).toBe(200);
    }
  });

  describe('tenancy', () => {
    it("never shows another distributor's never-ordered customer or counts", async () => {
      const a = (await get(`${DIST_A}/customer-health`, ADMIN_A)).body;
      const b = (await get(`${DIST_B}/customer-health`, ADMIN_B)).body;

      expect(a.needingAttention.map((c: { customerName: string }) => c.customerName)).not.toContain(`Health Customer ${CUST_NEVER_B}`);
      expect(b.needingAttention.map((c: { customerName: string }) => c.customerName)).toEqual([`Health Customer ${CUST_NEVER_B}`]);
      expect(b.tierCounts).toEqual({ healthy: 1, watch: 0, at_risk: 1 });
      expect(b.tiles.salesLast30d).toBe(999);
      // Each distributor's sales share counts only its own sales.
      expect(a.salesConcentration.totalValue).toBe(250);
      expect(b.salesConcentration.totalValue).toBe(999);
      expect(a.salesConcentration.topCustomers.map((c: { customerName: string }) => c.customerName)).not.toContain(`Health Customer ${CUST_HEALTHY_B}`);
    });

    it("refuses an admin reading another distributor's customer health", async () => {
      expect((await get(`${DIST_B}/customer-health`, ADMIN_A)).status).toBe(403);
    });
  });


  describe('review fixes (distributor C)', () => {
    type Flagged = { customerId: string; tier: string; reasons: Array<{ code: string }> };
    const codes = (body: { needingAttention: Flagged[] }, customerId: string) =>
      body.needingAttention.find((c) => c.customerId === customerId)?.reasons.map((r) => r.code) ?? [];

    it('ages a customer from when they accepted their invitation, not when the invite row was created', async () => {
      const { body } = await get(`${DIST_C}/customer-health`, ADMIN_C);

      expect(codes(body, C_INVITED)).not.toContain('NEVER_ORDERED'); // created 200 days ago, accepted yesterday
      expect(codes(body, C_STALE)).toContain('NEVER_ORDERED'); // the control: same age, never accepted
    });

    it('does not count rejected orders towards range narrowing (the completed twin proves the rule can fire)', async () => {
      const { body } = await get(`${DIST_C}/customer-health`, ADMIN_C);

      expect(codes(body, C_RANGE_REJECTED)).not.toContain('RANGE_NARROWING');
      expect(codes(body, C_RANGE_COMPLETED)).toContain('RANGE_NARROWING');
    });

    it('counts a customer with no active relationship in the 30-day sales tile', async () => {
      const { body } = await get(`${DIST_C}/customer-health`, ADMIN_C);

      // 700 from the inactive customer (no active relationship — the point of this test) + 200 from the customer whose
      // current orders completed + 50 + 50 from the two delivery-scenario customers. The rejected orders are excluded.
      expect(body.tiles.salesLast30d).toBe(1000);
    });

    it('counts a failed-then-retried delivery once, so it does not tip a customer into "late" (the late twin proves the rule can fire)', async () => {
      const { body } = await get(`${DIST_C}/customer-health`, ADMIN_C);

      expect(codes(body, C_RETRY)).not.toContain('LATE_DELIVERY'); // 3 deliveries, 1 problem (old logic: 4 attempts, 2 problems)
      expect(codes(body, C_LATE)).toContain('LATE_DELIVERY'); // 3 deliveries, 2 late
    });

    it('keeps this distributor separate from A and B', async () => {
      const { body } = await get(`${DIST_C}/customer-health`, ADMIN_C);
      const ids = body.needingAttention.map((c: Flagged) => c.customerId);

      expect(ids).not.toContain(CUST_NEVER_A);
      expect(ids).not.toContain(CUST_NEVER_B);
    });
  });

  describe('permissions', () => {
    it('lets a Distributor Admin (analytics:read) in', async () => {
      expect((await get(`${DIST_A}/customer-health`, ADMIN_A)).status).toBe(200);
    });

    it('refuses Warehouse staff, who has no analytics:read', async () => {
      expect((await get(`${DIST_A}/customer-health`, WAREHOUSE_A)).status).toBe(403);
    });

    it('requires authentication', async () => {
      expect((await get(`${DIST_A}/customer-health`)).status).toBe(401);
    });
  });
});
