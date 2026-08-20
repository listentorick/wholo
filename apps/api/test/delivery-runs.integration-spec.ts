/**
 * Integration tests for the Delivery Runs board — the read path (M3a) plus
 * the mutation endpoints (M3b: assign/unassign/reorder). Proves things a
 * mocked-Prisma unit test cannot: real cross-tenant scoping, that the read
 * path genuinely never creates a DeliveryRun row, that the optimistic-
 * concurrency CAS actually resolves a real concurrent race (via Postgres
 * row locking under $transaction, not just mocked call counts), and that
 * the ADR-052 trigger/unique-constraint pair is what the soft-remove-
 * before-create ordering depends on.
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
    const runs = await prisma.deliveryRun.findMany({ where: { distributorId: { in: [DIST_A, DIST_B] } }, select: { id: true } });
    const runIds = runs.map((r) => r.id);
    if (runIds.length) {
      await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'DeliveryRun', aggregateId: { in: runIds } } });
    }
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
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

  const createRun = (distributorId: string, name: string, overrides: Record<string, unknown> = {}) => prisma.deliveryRun.create({
    data: {
      distributorId, name, deliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`), ...overrides,
    },
  });

  const createAllocation = (runId: string, orderId: string, overrides: Record<string, unknown> = {}) => prisma.deliveryRunOrder.create({
    data: {
      runId, orderId, allocationSource: 'MANUAL', assignedByUserId: ADMIN_USER, ...overrides,
    },
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

  describe('assignOrderToRun (mutation)', () => {
    it('returns 404, not 403, when the run id belongs to another distributor', async () => {
      const runB = await createRun(DIST_B, 'B Local');
      const orderA = await createOrder(DIST_A, CUSTOMER_1);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-runs/${runB.id}/orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: orderA.id, version: 0 });

      expect(res.status).toBe(404);
    });

    it('never allows assigning distributor B\'s order into distributor A\'s run', async () => {
      const runA = await createRun(DIST_A, 'A Local');
      const orderB = await createOrder(DIST_B, CUSTOMER_1);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-runs/${runA.id}/orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: orderB.id, version: 0 });

      expect(res.status).toBe(404);
    });

    it('resolves a concurrent same-version race to exactly one 2xx and one 409, one active allocation, version incremented once', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');
      const order = await createOrder(DIST_A, CUSTOMER_1);

      const send = () => request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, version: 0 });

      const [res1, res2] = await Promise.all([send(), send()]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const activeAllocations = await prisma.deliveryRunOrder.count({ where: { runId: run.id, removedAt: null } });
      expect(activeAllocations).toBe(1);

      const updatedRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(updatedRun.version).toBe(1);
    });

    it('returns 422 as application/problem+json when assigning into a run that is already READY', async () => {
      const run = await createRun(DIST_A, 'Yorkshire', { status: 'READY' });
      const order = await createOrder(DIST_A, CUSTOMER_1);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, version: 0 });

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.detail).toBe('Cannot assign into a run that is already marked ready');
    });

    it('writes exactly one outbox event and one audit row for the mutation', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');
      const order = await createOrder(DIST_A, CUSTOMER_1);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, version: 0 });
      expect(res.status).toBe(200);

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'DeliveryRun', aggregateId: run.id, eventType: 'DeliveryRunOrderMoved' },
      });
      expect(outboxEvents).toHaveLength(1);

      const auditRows = await prisma.auditLog.findMany({
        where: { entityId: run.id, action: 'DELIVERY_RUN_ORDER_MOVED' },
      });
      expect(auditRows).toHaveLength(1);
    });
  });

  describe('ADR-052 ordering proof (soft-remove must happen before create)', () => {
    it('a cross-run move succeeds via the real endpoint — a create-before-remove reversal would P2002 and this would start failing', async () => {
      const runA1 = await createRun(DIST_A, 'Local');
      const runA2 = await createRun(DIST_A, 'Yorkshire');
      const order = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(runA1.id, order.id);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/delivery-runs/${runA2.id}/orders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, version: 0, sourceRunId: runA1.id });

      expect(res.status).toBe(200);

      const activeAllocation = await prisma.deliveryRunOrder.findFirst({ where: { activeOrderId: order.id } });
      expect(activeAllocation?.runId).toBe(runA2.id);
    });

    it('a raw create cannot produce a second active allocation for the same order (trigger + unique constraint)', async () => {
      const runA1 = await createRun(DIST_A, 'Local');
      const runA2 = await createRun(DIST_A, 'Yorkshire');
      const order = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(runA1.id, order.id);

      await expect(createAllocation(runA2.id, order.id)).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('unassignOrderFromRun (mutation)', () => {
    it('unassigns, densifies the remaining sequence, and bumps version exactly once', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');
      const orderA = await createOrder(DIST_A, CUSTOMER_1);
      const orderB = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(run.id, orderA.id, { deliverySequence: 1 });
      await createAllocation(run.id, orderB.id, { deliverySequence: 2 });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/orders/${orderA.id}?version=0`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      const rows = await prisma.deliveryRunOrder.findMany({ where: { runId: run.id, removedAt: null } });
      expect(rows).toHaveLength(1);
      expect(rows[0].orderId).toBe(orderB.id);
      expect(rows[0].deliverySequence).toBe(1);

      const updatedRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(updatedRun.version).toBe(1);
    });

    it('writes exactly one outbox event and one audit row for the mutation', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');
      const order = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(run.id, order.id, { deliverySequence: 1 });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/orders/${order.id}?version=0`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'DeliveryRun', aggregateId: run.id, eventType: 'DeliveryRunOrderUnassigned' },
      });
      expect(outboxEvents).toHaveLength(1);

      const auditRows = await prisma.auditLog.findMany({
        where: { entityId: run.id, action: 'DELIVERY_RUN_ORDER_UNASSIGNED' },
      });
      expect(auditRows).toHaveLength(1);
    });
  });

  describe('reorderRunOrders (mutation)', () => {
    it('reorders, leaves dense 1..n, and bumps version exactly once', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');
      const orderA = await createOrder(DIST_A, CUSTOMER_1);
      const orderB = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(run.id, orderA.id, { deliverySequence: 1 });
      await createAllocation(run.id, orderB.id, { deliverySequence: 2 });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/orders/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, orderedOrderIds: [orderB.id, orderA.id] });

      expect(res.status).toBe(200);

      const rows = await prisma.deliveryRunOrder.findMany({
        where: { runId: run.id, removedAt: null },
        orderBy: { deliverySequence: 'asc' },
      });
      expect(rows.map((r) => r.orderId)).toEqual([orderB.id, orderA.id]);
      expect(rows.map((r) => r.deliverySequence)).toEqual([1, 2]);

      const updatedRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(updatedRun.version).toBe(1);
    });

    it('writes exactly one outbox event and one audit row for the mutation', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');
      const order = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(run.id, order.id, { deliverySequence: 1 });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/orders/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, orderedOrderIds: [order.id] });
      expect(res.status).toBe(200);

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'DeliveryRun', aggregateId: run.id, eventType: 'DeliveryRunOrdersResequenced' },
      });
      expect(outboxEvents).toHaveLength(1);

      const auditRows = await prisma.auditLog.findMany({
        where: { entityId: run.id, action: 'DELIVERY_RUN_ORDERS_RESEQUENCED' },
      });
      expect(auditRows).toHaveLength(1);
    });
  });

  describe('updateRun (mark ready / reopen / driver override)', () => {
    it('returns 404, not 403, when the run id belongs to another distributor', async () => {
      const runB = await createRun(DIST_B, 'B Local');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${runB.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, status: 'READY' });

      expect(res.status).toBe(404);
    });

    it('marks a run ready: status/readyAt/readyByUserId set, version bumped once, outbox + audit written', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, status: 'READY' });

      expect(res.status).toBe(200);
      const runBody = res.body.runs.find((r: { runId: string }) => r.runId === run.id);
      expect(runBody.status).toBe('READY');

      const updatedRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(updatedRun.status).toBe('READY');
      expect(updatedRun.readyAt).not.toBeNull();
      expect(updatedRun.readyByUserId).toBe(ADMIN_USER);
      expect(updatedRun.version).toBe(1);

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'DeliveryRun', aggregateId: run.id, eventType: 'DeliveryRunMarkedReady' },
      });
      expect(outboxEvents).toHaveLength(1);
      const auditRows = await prisma.auditLog.findMany({
        where: { entityId: run.id, action: 'DELIVERY_RUN_MARKED_READY' },
      });
      expect(auditRows).toHaveLength(1);
    });

    it('reopens a READY run: readyAt/readyByUserId nulled, version bumped once', async () => {
      const run = await createRun(DIST_A, 'Yorkshire', {
        status: 'READY', readyAt: new Date(), readyByUserId: ADMIN_USER,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, status: 'OPEN' });

      expect(res.status).toBe(200);

      const updatedRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(updatedRun.status).toBe('OPEN');
      expect(updatedRun.readyAt).toBeNull();
      expect(updatedRun.readyByUserId).toBeNull();
      expect(updatedRun.version).toBe(1);

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'DeliveryRun', aggregateId: run.id, eventType: 'DeliveryRunReopened' },
      });
      expect(outboxEvents).toHaveLength(1);
    });

    it('changes the driver on an OPEN run', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, driverName: 'Sam' });

      expect(res.status).toBe(200);

      const updatedRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(updatedRun.driverName).toBe('Sam');

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'DeliveryRun', aggregateId: run.id, eventType: 'DeliveryRunDriverChanged' },
      });
      expect(outboxEvents).toHaveLength(1);
    });

    it('returns 422 as application/problem+json when marking ready a run that is already READY', async () => {
      const run = await createRun(DIST_A, 'Yorkshire', { status: 'READY' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, status: 'READY' });

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.detail).toBe('Run is already marked ready');
    });

    it('returns 422 when changing the driver on a READY run', async () => {
      const run = await createRun(DIST_A, 'Yorkshire', { status: 'READY' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, driverName: 'Sam' });

      expect(res.status).toBe(422);
      expect(res.body.detail).toBe('Cannot change driver on a run that is already marked ready');
    });

    it('returns 400 when neither status nor driverName is provided', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0 });

      expect(res.status).toBe(400);
    });

    // Mandatory per the M4 plan — proves the CAS actually resolves a real
    // concurrent race via Postgres row locking, not just mocked call counts.
    it('resolves a concurrent mark-ready race to exactly one 2xx and one 409, version incremented once', async () => {
      const run = await createRun(DIST_A, 'Yorkshire');

      const send = () => request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 0, status: 'READY' });

      const [res1, res2] = await Promise.all([send(), send()]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const updatedRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(updatedRun.status).toBe('READY');
      expect(updatedRun.version).toBe(1);
    });
  });

  describe('changeScheduledDeliveryDate (M5 mutation)', () => {
    it('returns 404, not 403, when the order belongs to another distributor', async () => {
      const orderB = await createOrder(DIST_B, CUSTOMER_1);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/orders/${orderB.id}/scheduled-delivery-date`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDeliveryDate: '2026-08-26', expectedScheduledDeliveryDate: DELIVERY_DATE });

      expect(res.status).toBe(404);
    });

    it('reschedules into a different run under the same route: densifies both ends and bumps both versions exactly once', async () => {
      const route = await createRoute(DIST_A, 'Yorkshire');
      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: route.id, customerId: CUSTOMER_1, defaultDropPosition: 1, assignedByUserId: ADMIN_USER,
        },
      });
      const runOld = await createRun(DIST_A, 'Yorkshire', { routeId: route.id });
      const orderA = await createOrder(DIST_A, CUSTOMER_1);
      const orderB = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(runOld.id, orderA.id, { deliverySequence: 1 });
      await createAllocation(runOld.id, orderB.id, { deliverySequence: 2 });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/orders/${orderA.id}/scheduled-delivery-date`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDeliveryDate: '2026-08-26', expectedScheduledDeliveryDate: DELIVERY_DATE });

      expect(res.status).toBe(200);
      expect(res.body.allocation.allocated).toBe(true);
      const newRunId = res.body.allocation.runId;
      expect(newRunId).not.toBe(runOld.id);

      const oldRunRows = await prisma.deliveryRunOrder.findMany({ where: { runId: runOld.id, removedAt: null } });
      expect(oldRunRows).toHaveLength(1);
      expect(oldRunRows[0].orderId).toBe(orderB.id);
      expect(oldRunRows[0].deliverySequence).toBe(1);

      const newRunRows = await prisma.deliveryRunOrder.findMany({ where: { runId: newRunId, removedAt: null } });
      expect(newRunRows).toHaveLength(1);
      expect(newRunRows[0].orderId).toBe(orderA.id);

      const updatedOldRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runOld.id } });
      expect(updatedOldRun.version).toBe(1);
      const updatedNewRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: newRunId } });
      expect(updatedNewRun.version).toBe(1);

      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderA.id } });
      expect(updatedOrder.scheduledDeliveryDate?.toISOString().slice(0, 10)).toBe('2026-08-26');
      // requestedDeliveryDate — the customer's original agreed date — is never touched.
      expect(updatedOrder.requestedDeliveryDate?.toISOString().slice(0, 10)).toBe(DELIVERY_DATE);
    });

    it('resolves a concurrent same-expected-date race to exactly one 2xx and one 409, order rescheduled exactly once', async () => {
      const route = await createRoute(DIST_A, 'Yorkshire');
      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: route.id, customerId: CUSTOMER_1, defaultDropPosition: 1, assignedByUserId: ADMIN_USER,
        },
      });
      const order = await createOrder(DIST_A, CUSTOMER_1);

      const send = () => request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/orders/${order.id}/scheduled-delivery-date`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDeliveryDate: '2026-08-26', expectedScheduledDeliveryDate: DELIVERY_DATE });

      const [res1, res2] = await Promise.all([send(), send()]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.scheduledDeliveryDate?.toISOString().slice(0, 10)).toBe('2026-08-26');

      const activeAllocations = await prisma.deliveryRunOrder.count({ where: { orderId: order.id, removedAt: null } });
      expect(activeAllocations).toBe(1);
    });

    it('returns 422 and leaves everything untouched when the current allocation is in a READY run', async () => {
      const run = await createRun(DIST_A, 'Yorkshire', { status: 'READY' });
      const order = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(run.id, order.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/orders/${order.id}/scheduled-delivery-date`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDeliveryDate: '2026-08-26', expectedScheduledDeliveryDate: DELIVERY_DATE });

      expect(res.status).toBe(422);
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.scheduledDeliveryDate?.toISOString().slice(0, 10)).toBe(DELIVERY_DATE);
      const activeAllocation = await prisma.deliveryRunOrder.findFirst({ where: { activeOrderId: order.id } });
      expect(activeAllocation?.runId).toBe(run.id);
    });

    // The transaction-ordering proof for M5: the destination is already READY
    // at request time, so the pre-transaction check rejects before the CAS'd
    // order-date update and the source soft-remove ever run — proven here by
    // asserting neither actually changed, not just by the status code.
    it('returns 422 and leaves everything untouched when the resolved destination run for the new date is already READY', async () => {
      const route = await createRoute(DIST_A, 'Yorkshire');
      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: route.id, customerId: CUSTOMER_1, defaultDropPosition: 1, assignedByUserId: ADMIN_USER,
        },
      });
      const runOld = await createRun(DIST_A, 'Yorkshire', { routeId: route.id });
      const order = await createOrder(DIST_A, CUSTOMER_1);
      await createAllocation(runOld.id, order.id);
      await createRun(DIST_A, 'Yorkshire', {
        routeId: route.id, deliveryDate: new Date('2026-08-26T00:00:00.000Z'), status: 'READY',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/orders/${order.id}/scheduled-delivery-date`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDeliveryDate: '2026-08-26', expectedScheduledDeliveryDate: DELIVERY_DATE });

      expect(res.status).toBe(422);
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.scheduledDeliveryDate?.toISOString().slice(0, 10)).toBe(DELIVERY_DATE);
      const activeAllocation = await prisma.deliveryRunOrder.findFirst({ where: { activeOrderId: order.id } });
      expect(activeAllocation?.runId).toBe(runOld.id);
    });

    it('leaves the order unassigned (NO_ROUTE) with no active route, writing exactly one outbox event and one audit row for the whole action', async () => {
      const order = await createOrder(DIST_A, CUSTOMER_1);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/orders/${order.id}/scheduled-delivery-date`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDeliveryDate: '2026-08-26', expectedScheduledDeliveryDate: DELIVERY_DATE });

      expect(res.status).toBe(200);
      expect(res.body.allocation).toEqual({ allocated: false, reason: 'NO_ROUTE' });

      const outboxEvents = await prisma.outboxEvent.findMany({
        where: { aggregateType: 'Order', aggregateId: order.id, eventType: 'OrderScheduledDeliveryDateChanged' },
      });
      expect(outboxEvents).toHaveLength(1);

      const auditRows = await prisma.auditLog.findMany({
        where: { entityId: order.id, action: 'ORDER_SCHEDULED_DELIVERY_DATE_CHANGED' },
      });
      expect(auditRows).toHaveLength(1);
    });
  });

  describe('getReschedulePreview', () => {
    it('surfaces another accepted order at the same delivery address within the window, excluding itself', async () => {
      const address = { line1: '12 High Street', postcode: 'YO1 1AA' };
      const order = await createOrder(DIST_A, CUSTOMER_1, { deliveryAddressSnapshot: address });
      const nearby = await createOrder(DIST_A, CUSTOMER_1, {
        deliveryAddressSnapshot: address,
        requestedDeliveryDate: new Date('2026-08-24T00:00:00.000Z'),
        scheduledDeliveryDate: new Date('2026-08-24T00:00:00.000Z'),
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/orders/${order.id}/reschedule-preview?date=${DELIVERY_DATE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.nearbyDeliveries.map((d: { orderId: string }) => d.orderId)).toEqual([nearby.id]);
    });

    it('excludes a same-window order at a different address', async () => {
      const order = await createOrder(DIST_A, CUSTOMER_1, {
        deliveryAddressSnapshot: { line1: '12 High Street', postcode: 'YO1 1AA' },
      });
      await createOrder(DIST_A, CUSTOMER_1, {
        deliveryAddressSnapshot: { line1: 'Other Road', postcode: 'YO2 2BB' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/orders/${order.id}/reschedule-preview?date=${DELIVERY_DATE}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.nearbyDeliveries).toEqual([]);
    });

    it('never creates a run on the preview path', async () => {
      const route = await createRoute(DIST_A, 'Yorkshire');
      await prisma.deliveryRouteCustomer.create({
        data: {
          routeId: route.id, customerId: CUSTOMER_1, defaultDropPosition: 1, assignedByUserId: ADMIN_USER,
        },
      });
      const order = await createOrder(DIST_A, CUSTOMER_1);
      const countBefore = await prisma.deliveryRun.count({ where: { distributorId: DIST_A } });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/orders/${order.id}/reschedule-preview?date=2026-08-27`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.resolution).toEqual({ allocated: true, runId: null, runName: 'Yorkshire' });
      const countAfter = await prisma.deliveryRun.count({ where: { distributorId: DIST_A } });
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('getDay — MISSED attention (M5)', () => {
    it('flags a still-unassigned order as MISSED once its date is in the past', async () => {
      const pastDate = '2020-01-01';
      const order = await createOrder(DIST_A, CUSTOMER_1, {
        requestedDeliveryDate: new Date(`${pastDate}T00:00:00.000Z`),
        scheduledDeliveryDate: new Date(`${pastDate}T00:00:00.000Z`),
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/distributors/${DIST_A}/delivery-days/${pastDate}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const card = res.body.unassigned.find((c: { orderId: string }) => c.orderId === order.id);
      expect(card.attention).toBe('MISSED');
    });
  });
});
