/**
 * Integration tests for the driver manifest PDF endpoint
 * (GET distributors/:distributorId/delivery-runs/:runId/manifest).
 *
 * Focused on what a mocked-Prisma unit test cannot prove: real cross-tenant
 * scoping (both the "wrong distributorId in the path" and "right path, but
 * the run belongs to someone else" shapes) and that the full stack — guard,
 * service, real DB, PDFKit — actually produces a PDF response.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrderLineStatus, OrderStatus, OrganisationType, Prisma, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-manifest-dist-a';
const DIST_B = 'test-manifest-dist-b';
const CUSTOMER_1 = 'test-manifest-customer-1';
const ADMIN_USER = 'test-manifest-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-manifest-admin';

const DELIVERY_DATE = '2026-08-26';

describe('Driver manifest (integration)', () => {
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
      create: { id: DIST_A, name: 'Manifest Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Manifest Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER_1 },
      create: { id: CUSTOMER_1, name: 'The Old Hall', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'manifest-admin@integration.test',
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

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'manifest-admin@integration.test' });
  });

  afterEach(async () => {
    const runs = await prisma.deliveryRun.findMany({ where: { distributorId: { in: [DIST_A, DIST_B] } }, select: { id: true } });
    const runIds = runs.map((r) => r.id);
    if (runIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: runIds } } });
    }
    await prisma.deliveryRunOrder.deleteMany({ where: { run: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.deliveryRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderLine.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER_1] } } });
    await app.close();
    await jwtServer.close();
  });

  const createRun = (distributorId: string, name: string, overrides: Record<string, unknown> = {}) => prisma.deliveryRun.create({
    data: {
      distributorId, name, deliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`), ...overrides,
    },
  });

  const createOrderWithLine = async (distributorId: string, traderCustomerId: string) => {
    const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const orderNumber = `TEST-MANIFEST-${seqResult[0].nextval}`;
    const order = await prisma.order.create({
      data: {
        distributorId,
        traderCustomerId,
        placedByUserId: ADMIN_USER,
        orderNumber,
        currency: 'GBP',
        status: OrderStatus.ACCEPTED,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('30.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('30.00'),
        submittedAt: new Date(),
        acceptedAt: new Date(),
        requestedDeliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`),
        scheduledDeliveryDate: new Date(`${DELIVERY_DATE}T00:00:00.000Z`),
        deliveryAddressSnapshot: { line1: '8 High Street', city: 'Halifax', postcode: 'HX1 2AB', country: 'GB' },
        notes: 'Use the rear entrance.',
      },
    });
    const product = await prisma.product.create({
      data: { distributorId, name: 'Rioja Crianza', sku: `TEST-MANIFEST-SKU-${order.id}` },
    });
    await prisma.orderLine.create({
      data: {
        orderId: order.id,
        distributorId,
        traderCustomerId,
        productId: product.id,
        productNameSnapshot: product.name,
        quantityOrdered: 3,
        unitPriceSnapshot: new Prisma.Decimal('10.00'),
        subtotalAmount: new Prisma.Decimal('30.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('30.00'),
        status: OrderLineStatus.ACCEPTED,
      },
    });
    return order;
  };

  const createAllocation = (runId: string, orderId: string, overrides: Record<string, unknown> = {}) => prisma.deliveryRunOrder.create({
    data: {
      runId, orderId, allocationSource: 'MANUAL', assignedByUserId: ADMIN_USER, ...overrides,
    },
  });

  it('rejects a distributorId path the caller has no membership for, with 403 (DistributorAccessGuard)', async () => {
    const run = await createRun(DIST_B, 'B Local', { status: 'READY' });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_B}/delivery-runs/${run.id}/manifest`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('returns 404, not 403, when the run id belongs to another distributor than the authorized path', async () => {
    const runB = await createRun(DIST_B, 'B Local', { status: 'READY' });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/delivery-runs/${runB.id}/manifest`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 422 as application/problem+json when the run is not yet Ready', async () => {
    const run = await createRun(DIST_A, 'Yorkshire Wednesday');
    const order = await createOrderWithLine(DIST_A, CUSTOMER_1);
    await createAllocation(run.id, order.id, { deliverySequence: 1 });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/manifest`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 422 when the run is Ready but has no active orders', async () => {
    const run = await createRun(DIST_A, 'Yorkshire Wednesday', { status: 'READY' });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/manifest`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });

  it('generates a printable PDF for a Ready run with orders, and writes one audit row', async () => {
    const run = await createRun(DIST_A, 'Yorkshire Wednesday', { status: 'READY' });
    const order = await createOrderWithLine(DIST_A, CUSTOMER_1);
    await createAllocation(run.id, order.id, { deliverySequence: 1 });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/manifest`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const auditRows = await prisma.auditLog.findMany({
      where: { entityId: run.id, action: 'DELIVERY_RUN_MANIFEST_GENERATED' },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('never includes an order removed from the run (soft-deleted allocation) — page count proves exclusion, not inclusion', async () => {
    const run = await createRun(DIST_A, 'Yorkshire Wednesday', { status: 'READY' });
    const activeOrder = await createOrderWithLine(DIST_A, CUSTOMER_1);
    const removedOrder = await createOrderWithLine(DIST_A, CUSTOMER_1);
    await createAllocation(run.id, activeOrder.id, { deliverySequence: 1 });
    await createAllocation(run.id, removedOrder.id, {
      deliverySequence: 2, removedAt: new Date(), removedByUserId: ADMIN_USER,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/delivery-runs/${run.id}/manifest`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    // PDFKit compresses content streams by default, so page dictionaries
    // (never compressed) are the reliable signal here — 1 overview page + 1
    // order page. If the removed allocation leaked in, this would be 3.
    const pageMatches = (res.body as Buffer).toString('latin1').match(/\/Type\s*\/Page(?!s)/g);
    expect(pageMatches?.length).toBe(2);
  });
});
