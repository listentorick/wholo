/**
 * The Delivery dashboard's two reads, proven against a real database and the real
 * JWT + guard pipeline: the live snapshot (GET delivery-overview) and the
 * history series (GET delivery-outcomes). What a mocked-Prisma unit test cannot
 * show: that each bucket really selects the right orders, that a distributor
 * never sees another's data, that "today" is the distributor's local day, and
 * that the permission boundary holds.
 *
 * Time is pinned (Date only) to 2035-01-10 23:30Z — already 2035-01-11 in
 * Pacific/Auckland — so the local day and the UTC day genuinely differ.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DeliveryOutcomeType, OrderStatus, OrganisationType, Prisma, Role, UnableToDeliverReason } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-dovw-dist-a';
const DIST_B = 'test-dovw-dist-b';
const CUSTOMER = 'test-dovw-customer';
const TZ = 'Pacific/Auckland';
const NOW = new Date('2035-01-10T23:30:00.000Z'); // 2035-01-11 12:30 in Auckland
const TODAY = '2035-01-11'; // Auckland
const UTC_TODAY = '2035-01-10'; // what a UTC-based "today" would wrongly be

type Fixture = { id: string; kc: string; email: string; role: Role; org: string };
const WAREHOUSE_A: Fixture = { id: 'test-dovw-wh-a', kc: 'kc-test-dovw-wh-a', email: 'wh-a@dovw.integration.test', role: Role.WAREHOUSE_STAFF, org: DIST_A };
const DRIVER_A: Fixture = { id: 'test-dovw-driver-a', kc: 'kc-test-dovw-driver-a', email: 'driver-a@dovw.integration.test', role: Role.DRIVER, org: DIST_A };
const WAREHOUSE_B: Fixture = { id: 'test-dovw-wh-b', kc: 'kc-test-dovw-wh-b', email: 'wh-b@dovw.integration.test', role: Role.WAREHOUSE_STAFF, org: DIST_B };
const USERS = [WAREHOUSE_A, DRIVER_A, WAREHOUSE_B];
const DISTS = [DIST_A, DIST_B];

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Delivery overview and outcomes (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  const tokens: Record<string, string> = {};

  const get = (path: string, as?: Fixture) => {
    const req = request(app.getHttpServer()).get(`/api/v1/distributors/${path}`);
    return as ? req.set('Authorization', `Bearer ${tokens[as.id]}`) : req;
  };

  beforeAll(async () => {
    // Fake only Date: everything that does I/O keeps its real timers.
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
      await prisma.organisation.upsert({ where: { id }, create: { id, name: `Overview Test ${id}`, type: OrganisationType.DISTRIBUTOR }, update: {} });
      await prisma.distributorSettings.upsert({ where: { distributorId: id }, create: { distributorId: id, timezone: TZ }, update: { timezone: TZ } });
    }
    await prisma.organisation.upsert({ where: { id: CUSTOMER }, create: { id: CUSTOMER, name: 'Blackbird Kitchen', type: OrganisationType.TRADE_CUSTOMER }, update: {} });
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
  });

  const clean = async () => {
    await prisma.deliveryFact.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.orderDeliveryOutcome.deleteMany({ where: { order: { distributorId: { in: DISTS } } } });
    await prisma.deliveryRunOrder.deleteMany({ where: { run: { distributorId: { in: DISTS } } } });
    await prisma.deliveryRun.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: DISTS } } });
  };

  afterEach(clean);

  afterAll(async () => {
    await clean();
    await prisma.membershipRole.deleteMany({ where: { membership: { userId: { in: USERS.map((u) => u.id) } } } });
    await prisma.membership.deleteMany({ where: { userId: { in: USERS.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: USERS.map((u) => u.id) } } });
    await prisma.distributorSettings.deleteMany({ where: { distributorId: { in: DISTS } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [...DISTS, CUSTOMER] } } });
    await app.close();
    await jwtServer.close();
    jest.useRealTimers();
  });

  const order = async (distributorId: string, status: OrderStatus, over: Partial<Prisma.OrderUncheckedCreateInput> = {}) => {
    const seq = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    return prisma.order.create({
      data: {
        distributorId, traderCustomerId: CUSTOMER, placedByUserId: WAREHOUSE_A.id, orderNumber: `TEST-DOVW-${seq[0].nextval}`, currency: 'GBP', status,
        acceptanceModeSnapshot: 'MANUAL', acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('100.00'), taxAmount: new Prisma.Decimal('0.00'), totalAmount: new Prisma.Decimal('100.00'),
        submittedAt: new Date('2035-01-09T09:00:00.000Z'), acceptedAt: new Date('2035-01-09T10:00:00.000Z'),
        ...over,
      },
    });
  };
  const run = (distributorId: string, name: string, date: string, driverName: string | null = null) =>
    prisma.deliveryRun.create({ data: { distributorId, name, deliveryDate: d(date), driverName } });
  const onRun = (runId: string, orderId: string) =>
    prisma.deliveryRunOrder.create({ data: { runId, orderId, allocationSource: 'MANUAL', assignedByUserId: WAREHOUSE_A.id } });
  const outcome = (orderId: string, kind: DeliveryOutcomeType, recordedAt: string, unableReason?: UnableToDeliverReason) =>
    prisma.orderDeliveryOutcome.create({
      data: { orderId, outcome: kind, recordedAt: new Date(recordedAt), unableReason, dropMethod: kind === 'DELIVERED' ? 'LEFT_IN_SAFE_LOCATION' : undefined },
    });

  /** A warehouse's day, one of everything, plus things that must NOT be counted. */
  async function seedDayForA() {
    // To accept
    await order(DIST_A, OrderStatus.SUBMITTED, { submittedAt: new Date('2035-01-10T22:00:00.000Z') });
    await order(DIST_A, OrderStatus.SUBMITTED, { submittedAt: new Date('2035-01-10T20:00:00.000Z') }); // the oldest
    // Overdue: scheduled in the past; and requested 10 Jan, which is yesterday in Auckland (but "today" in UTC)
    await order(DIST_A, OrderStatus.ACCEPTED, { scheduledDeliveryDate: d('2035-01-09'), requestedDeliveryDate: d('2035-01-08') });
    await order(DIST_A, OrderStatus.ACCEPTED, { scheduledDeliveryDate: null, requestedDeliveryDate: d(UTC_TODAY) });
    // Not on a run: due today, no run — by scheduled date, and by requested date alone
    await order(DIST_A, OrderStatus.ACCEPTED, { scheduledDeliveryDate: d(TODAY), requestedDeliveryDate: d('2035-01-09') });
    await order(DIST_A, OrderStatus.ACCEPTED, { scheduledDeliveryDate: null, requestedDeliveryDate: d(TODAY) });
    // Must not be counted anywhere: undated, and due tomorrow
    await order(DIST_A, OrderStatus.ACCEPTED, { scheduledDeliveryDate: null, requestedDeliveryDate: null });
    await order(DIST_A, OrderStatus.ACCEPTED, { scheduledDeliveryDate: d('2035-01-12'), requestedDeliveryDate: d('2035-01-12') });
    await order(DIST_A, OrderStatus.CANCELLED, { scheduledDeliveryDate: d(TODAY) });

    // Today's run: one delivered, one failed (within 24h), one still to do
    const r1 = await run(DIST_A, 'R1 North', TODAY, 'Dan Whitmore');
    const delivered = await order(DIST_A, OrderStatus.DELIVERED, { scheduledDeliveryDate: d(TODAY), requestedDeliveryDate: d(TODAY) });
    const failed = await order(DIST_A, OrderStatus.DELIVERY_FAILED, { scheduledDeliveryDate: d(TODAY), requestedDeliveryDate: d(TODAY) });
    const todo = await order(DIST_A, OrderStatus.ACCEPTED, { scheduledDeliveryDate: d(TODAY), requestedDeliveryDate: d(TODAY) });
    for (const o of [delivered, failed, todo]) await onRun(r1.id, o.id);
    await outcome(delivered.id, 'DELIVERED', '2035-01-10T21:00:00.000Z');
    await outcome(failed.id, 'UNABLE_TO_DELIVER', '2035-01-10T22:30:00.000Z', 'CUSTOMER_CLOSED');

    // Not counted: a failure two days ago, and yesterday's run
    const oldFail = await order(DIST_A, OrderStatus.DELIVERY_FAILED, { scheduledDeliveryDate: d('2035-01-08') });
    await outcome(oldFail.id, 'UNABLE_TO_DELIVER', '2035-01-08T10:00:00.000Z', 'UNABLE_TO_ACCESS_PREMISES');
    const yesterdayRun = await run(DIST_A, 'R9 Yesterday', UTC_TODAY);
    const yOrder = await order(DIST_A, OrderStatus.DELIVERED, { scheduledDeliveryDate: d(UTC_TODAY) });
    await onRun(yesterdayRun.id, yOrder.id);

    return { failed };
  }

  describe('GET delivery-overview', () => {
    it("puts every order in the right bucket, on the distributor's local day", async () => {
      const { failed } = await seedDayForA();

      const res = await get(`${DIST_A}/delivery-overview`, WAREHOUSE_A);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ distributorId: DIST_A, date: TODAY, timezone: TZ });
      expect(res.body.counts).toEqual({
        toAccept: { count: 2, oldestSubmittedAt: '2035-01-10T20:00:00.000Z' },
        overdue: { count: 2 }, // includes the order requested for 10 Jan: overdue in Auckland even though it is "today" in UTC
        notOnRun: { count: 2 },
        failedLast24h: { count: 1 }, // the failure from two days ago is excluded
      });
      expect(res.body.queue.map((i: { kind: string }) => i.kind)).toEqual(['FAILED', 'OVERDUE', 'OVERDUE', 'TO_ACCEPT', 'TO_ACCEPT', 'NOT_ON_RUN', 'NOT_ON_RUN']);
      expect(res.body.queue[0]).toMatchObject({
        kind: 'FAILED', orderId: failed.id, reason: 'CUSTOMER_CLOSED', runName: 'R1 North', customerName: 'Blackbird Kitchen', since: '2035-01-10T22:30:00.000Z',
      });
    });

    it("summarises today's run and adds up: planned = delivered + failed + remaining", async () => {
      await seedDayForA();

      const { runs, progress } = (await get(`${DIST_A}/delivery-overview`, WAREHOUSE_A)).body;

      expect(runs).toHaveLength(1); // yesterday's run is not today's
      expect(runs[0]).toMatchObject({ name: 'R1 North', driverName: 'Dan Whitmore', status: 'OPEN', stopCount: 3, attemptedCount: 2, lastDropAt: '2035-01-10T22:30:00.000Z' });
      // 1 delivered + 1 failed + (1 still on the run + 2 accepted-for-today with no run) remaining
      expect(progress).toEqual({ planned: 5, delivered: 1, failed: 1, remaining: 3 });
    });

    it('caps the queue per kind but reports the true total', async () => {
      for (let i = 0; i < 14; i++) await order(DIST_A, OrderStatus.SUBMITTED, { submittedAt: new Date(`2035-01-10T0${i % 10}:00:00.000Z`) });

      const { counts, queue, queueCap } = (await get(`${DIST_A}/delivery-overview`, WAREHOUSE_A)).body;

      expect(counts.toAccept.count).toBe(14);
      expect(queue).toHaveLength(queueCap);
      expect(queue.every((i: { kind: string }) => i.kind === 'TO_ACCEPT')).toBe(true);
    });

    it('is a clean all-zero snapshot for a distributor with nothing going on', async () => {
      const res = await get(`${DIST_A}/delivery-overview`, WAREHOUSE_A);

      expect(res.status).toBe(200);
      expect(res.body.counts).toEqual({ toAccept: { count: 0, oldestSubmittedAt: null }, overdue: { count: 0 }, notOnRun: { count: 0 }, failedLast24h: { count: 0 } });
      expect(res.body.progress).toEqual({ planned: 0, delivered: 0, failed: 0, remaining: 0 });
      expect(res.body.runs).toEqual([]);
      expect(res.body.queue).toEqual([]);
    });

    describe('tenancy', () => {
      it("never counts or lists another distributor's orders, runs or failures", async () => {
        await seedDayForA();
        const bRun = await run(DIST_B, 'B Local', TODAY);
        const bOrder = await order(DIST_B, OrderStatus.DELIVERY_FAILED, { scheduledDeliveryDate: d(TODAY) });
        await onRun(bRun.id, bOrder.id);
        await outcome(bOrder.id, 'UNABLE_TO_DELIVER', '2035-01-10T22:00:00.000Z', 'CUSTOMER_REFUSED');
        await order(DIST_B, OrderStatus.SUBMITTED);

        const a = (await get(`${DIST_A}/delivery-overview`, WAREHOUSE_A)).body;
        const b = (await get(`${DIST_B}/delivery-overview`, WAREHOUSE_B)).body;

        expect(a.counts.failedLast24h.count).toBe(1);
        expect(a.counts.toAccept.count).toBe(2);
        expect(a.runs.map((r: { name: string }) => r.name)).toEqual(['R1 North']);
        expect(b.counts).toMatchObject({ toAccept: { count: 1 }, failedLast24h: { count: 1 }, overdue: { count: 0 }, notOnRun: { count: 0 } });
        expect(b.runs.map((r: { name: string }) => r.name)).toEqual(['B Local']);
        expect(b.queue.map((i: { orderId: string }) => i.orderId)).not.toContain(a.queue[0].orderId);
      });

      it("refuses a warehouse member reading another distributor's overview", async () => {
        expect((await get(`${DIST_B}/delivery-overview`, WAREHOUSE_A)).status).toBe(403);
      });
    });

    describe('permissions', () => {
      it('lets Warehouse staff in (orders:read + delivery:read), without analytics:read', async () => {
        expect((await get(`${DIST_A}/delivery-overview`, WAREHOUSE_A)).status).toBe(200);
      });

      it('refuses a Driver, who has delivery access but cannot read orders', async () => {
        expect((await get(`${DIST_A}/delivery-overview`, DRIVER_A)).status).toBe(403);
      });

      it('requires authentication', async () => {
        expect((await get(`${DIST_A}/delivery-overview`)).status).toBe(401);
      });
    });
  });

  describe('GET delivery-outcomes', () => {
    const fact = (over: Partial<Prisma.DeliveryFactUncheckedCreateInput> & { eventId: string }) =>
      prisma.deliveryFact.create({
        data: {
          distributorId: DIST_A, orderId: `o-${over.eventId}`, traderCustomerId: CUSTOMER, outcome: 'DELIVERED',
          occurredAt: new Date('2035-01-05T12:00:00.000Z'), distributorLocalDate: d('2035-01-05'), committedDate: d('2035-01-05'), ...over,
        },
      });

    it('buckets outcomes by the day they were committed to: on time, late, failed — zero-filled, this distributor only', async () => {
      await fact({ eventId: 'f1' }); // delivered the day it was committed
      await fact({ eventId: 'f2', distributorLocalDate: d('2035-01-04') }); // delivered early: still on time
      await fact({ eventId: 'f3', distributorLocalDate: d('2035-01-06') }); // delivered a day late
      await fact({ eventId: 'f4', outcome: 'UNABLE_TO_DELIVER', unableReason: 'CUSTOMER_CLOSED' });
      await fact({ eventId: 'f5', committedDate: null, distributorLocalDate: d('2035-01-07') }); // undated: bucketed by the day it happened
      await fact({ eventId: 'f6', distributorId: DIST_B }); // someone else's

      const res = await get(`${DIST_A}/delivery-outcomes?from=2035-01-04&to=2035-01-07`, WAREHOUSE_A);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ distributorId: DIST_A, from: '2035-01-04', to: '2035-01-07', timezone: TZ });
      expect(res.body.days).toEqual([
        { date: '2035-01-04', onTime: 0, late: 0, failed: 0 },
        { date: '2035-01-05', onTime: 2, late: 1, failed: 1 },
        { date: '2035-01-06', onTime: 0, late: 0, failed: 0 },
        { date: '2035-01-07', onTime: 1, late: 0, failed: 0 },
      ]);
    });

    it('excludes days outside the requested window', async () => {
      await fact({ eventId: 'f1' });
      const res = await get(`${DIST_A}/delivery-outcomes?from=2035-01-06&to=2035-01-08`, WAREHOUSE_A);
      expect(res.body.days.every((day: { onTime: number }) => day.onTime === 0)).toBe(true);
    });

    it.each([
      ['a malformed date', 'from=05-01-2035&to=2035-01-07'],
      ['a missing bound', 'from=2035-01-04'],
      ['a window longer than 92 days', 'from=2034-09-01&to=2035-01-07'],
      ['a window that ends before it starts', 'from=2035-01-07&to=2035-01-04'],
      ['a date not on the calendar', 'from=2035-02-30&to=2035-03-04'],
    ])('rejects %s', async (_label, qs) => {
      expect((await get(`${DIST_A}/delivery-outcomes?${qs}`, WAREHOUSE_A)).status).toBe(400);
    });

    it("refuses another distributor's series, a Driver, and an anonymous caller", async () => {
      const qs = 'from=2035-01-04&to=2035-01-07';
      expect((await get(`${DIST_B}/delivery-outcomes?${qs}`, WAREHOUSE_A)).status).toBe(403);
      expect((await get(`${DIST_A}/delivery-outcomes?${qs}`, DRIVER_A)).status).toBe(403);
      expect((await get(`${DIST_A}/delivery-outcomes?${qs}`)).status).toBe(401);
    });
  });
});
