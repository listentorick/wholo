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
import {
  AccountingConnectionStatus,
  AccountingProvider,
  AccountingTaxTypeMatchMethod,
  DeliveryAllocationSource,
  DeliveryDropMethod,
  DeliveryOutcomeType,
  OrganisationType,
  OrderStatus,
  OrderLineStatus,
  Prisma,
  Role,
  TaxClassification,
  UnableToDeliverReason,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { R2StorageService } from '../src/asset-images/r2-storage.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const mockR2 = {
  deliveryBucket: 'test-delivery-bucket',
  upload: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  download: jest.fn().mockResolvedValue(Buffer.from('webp')),
  getPublicUrl: jest.fn((k: string) => `https://cdn.example/${k}`),
  presignGetUrl: jest.fn((k: string) => Promise.resolve(`https://signed.example/${k}?sig=x`)),
};

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

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(R2StorageService)
      .useValue(mockR2)
      .compile();
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
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderDeliveryPhoto.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderDeliveryOutcome.deleteMany({ where: { order: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.deliveryRunOrder.deleteMany({ where: { run: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.deliveryRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderLine.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.taxTypeAccountingMapping.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.externalAccountingTaxType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.taxType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
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
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderDeliveryPhoto.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderDeliveryOutcome.deleteMany({ where: { order: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.deliveryRunOrder.deleteMany({ where: { run: { distributorId: { in: [DIST_A, DIST_B] } } } });
    await prisma.deliveryRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderLine.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.taxTypeAccountingMapping.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.externalAccountingTaxType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.taxType.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.product.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  const createOrder = async (
    distributorId: string,
    status: OrderStatus = OrderStatus.SUBMITTED,
    overrides: Record<string, unknown> = {},
  ) => {
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
        ...overrides,
      },
    });
  };

  const createConnection = (distributorId: string) =>
    prisma.accountingConnection.create({
      data: {
        distributorId,
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId: `tenant-${distributorId}`,
        externalOrganisationName: 'Acme Wines',
        scopes: 'openid accounting.invoices',
        encryptedCredentialData: 'irrelevant-for-this-test',
        connectedByUserId: USER_A,
        connectedAt: new Date(),
      },
    });

  const createOrderWithTaxLine = async (distributorId: string, taxTypeId: string | null) => {
    const order = await createOrder(distributorId, OrderStatus.SUBMITTED);
    const product = await prisma.product.create({
      data: { distributorId, name: 'Test Wine', sku: `TEST-ORD-SKU-${order.id}` },
    });
    await prisma.orderLine.create({
      data: {
        orderId: order.id,
        distributorId,
        traderCustomerId: distributorId,
        productId: product.id,
        productNameSnapshot: product.name,
        quantityOrdered: 1,
        unitPriceSnapshot: new Prisma.Decimal('10.00'),
        subtotalAmount: new Prisma.Decimal('10.00'),
        taxAmount: new Prisma.Decimal('2.00'),
        totalAmount: new Prisma.Decimal('12.00'),
        taxTypeId,
        status: OrderLineStatus.SUBMITTED,
      },
    });
    return order;
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

    // The M4 undated-deliveries panel relies on this filter — an accepted
    // order with no requestedDeliveryDate never appears on any dated
    // delivery-runs board (see docs/delivery-planning-pbi-plan.md).
    it('the undated filter returns only this distributor\'s dateless orders', async () => {
      const undatedA = await createOrder(DIST_A, OrderStatus.ACCEPTED);
      const datedA = await createOrder(DIST_A, OrderStatus.ACCEPTED, { requestedDeliveryDate: new Date('2026-09-01T00:00:00.000Z') });
      const undatedB = await createOrder(DIST_B, OrderStatus.ACCEPTED);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders?status=ACCEPTED&undated=true`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((o: { id: string }) => o.id);
      expect(ids).toContain(undatedA.id);
      expect(ids).not.toContain(datedA.id);
      expect(ids).not.toContain(undatedB.id);
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

  // ── GET /admin/distributors/:distributorId/orders/:id/delivery-outcome ─────

  describe('GET /api/v1/admin/distributors/:distributorId/orders/:id/delivery-outcome', () => {
    const createOutcome = async (
      distributorId: string,
      opts: {
        failed?: boolean;
        withRun?: boolean;
        withPhoto?: boolean;
        locationUnavailable?: boolean;
        signature?: Prisma.InputJsonValue;
        unableReason?: UnableToDeliverReason;
      } = {},
    ) => {
      const delivered = !opts.failed;
      const order = await createOrder(
        distributorId,
        delivered ? OrderStatus.DELIVERED : OrderStatus.DELIVERY_FAILED,
      );

      const outcome = await prisma.orderDeliveryOutcome.create({
        data: {
          orderId: order.id,
          outcome: delivered ? DeliveryOutcomeType.DELIVERED : DeliveryOutcomeType.UNABLE_TO_DELIVER,
          recipientName: delivered ? 'Jane Doe' : null,
          dropMethod: delivered ? DeliveryDropMethod.HANDED_TO_PERSON : null,
          signature: opts.signature,
          unableReason: delivered ? null : (opts.unableReason ?? UnableToDeliverReason.CUSTOMER_CLOSED),
          latitude: opts.locationUnavailable ? null : 51.51,
          longitude: opts.locationUnavailable ? null : -0.12,
          locationAccuracyM: opts.locationUnavailable ? null : 12,
          locationUnavailable: opts.locationUnavailable ?? false,
        },
      });

      if (opts.withPhoto) {
        await prisma.orderDeliveryPhoto.create({
          data: {
            orderId: order.id,
            distributorId,
            outcomeId: outcome.id,
            variants: { full: `distributors/${distributorId}/deliveries/${order.id}/p/full.webp`, thumb: `distributors/${distributorId}/deliveries/${order.id}/p/thumb.webp` },
            sourceMimeType: 'image/jpeg',
            sourceSizeBytes: 1000,
            sortOrder: 0,
          },
        });
      }

      if (opts.withRun) {
        const run = await prisma.deliveryRun.create({
          data: { distributorId, deliveryDate: new Date('2026-08-28'), name: 'Tuesday Run', driverName: 'James Vine' },
        });
        await prisma.deliveryRunOrder.create({
          data: { runId: run.id, orderId: order.id, allocationSource: DeliveryAllocationSource.MANUAL },
        });
      }

      return order;
    };

    it('returns the recorded outcome with derived driver/run and presigned photo URLs', async () => {
      const order = await createOutcome(DIST_A, { withRun: true, withPhoto: true });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/delivery-outcome`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('DELIVERED');
      expect(res.body.recipientName).toBe('Jane Doe');
      expect(res.body.driverName).toBe('James Vine');
      expect(res.body.runName).toBe('Tuesday Run');
      expect(res.body.runDeliveryDate).toBe('2026-08-28');
      expect(res.body.location).toMatchObject({ available: true, latitude: 51.51, longitude: -0.12 });
      expect(res.body.photos).toHaveLength(1);
      expect(res.body.photos[0].url).toMatch(/^https:\/\/signed\.example\//);
      // no raw R2 keys leak in the response
      expect(JSON.stringify(res.body)).not.toContain('deliveries/');
    });

    it('returns 404 when the order belongs to a different distributor', async () => {
      const orderB = await createOutcome(DIST_B, {});

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${orderB.id}/delivery-outcome`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when the order has no recorded outcome', async () => {
      const order = await createOrder(DIST_A, OrderStatus.DELIVERED);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/delivery-outcome`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller has no membership of the path distributor', async () => {
      const orderB = await createOutcome(DIST_B, {});

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_B}/orders/${orderB.id}/delivery-outcome`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('maps an unable-to-deliver outcome and reports location unavailable', async () => {
      const order = await createOutcome(DIST_A, {
        failed: true,
        locationUnavailable: true,
        unableReason: UnableToDeliverReason.INCORRECT_ADDRESS,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/delivery-outcome`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('UNABLE_TO_DELIVER');
      expect(res.body.orderStatus).toBe('DELIVERY_FAILED');
      expect(res.body.unableReason).toBe('INCORRECT_ADDRESS');
      expect(res.body.dropMethod).toBeNull();
      expect(res.body.location.available).toBe(false);
      expect(res.body.location.latitude).toBeNull();
    });

    it('passes the signature blob through unchanged', async () => {
      const signature = { format: 'signature_pad', version: 5, width: 300, height: 150, strokes: [[{ x: 1, y: 2, time: 0 }]] };
      const order = await createOutcome(DIST_A, { signature });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/delivery-outcome`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.signature).toEqual(signature);
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

    describe('tax type mapping gate', () => {
      it('returns 409 TAX_TYPE_UNMAPPED when the distributor has a connected accounting integration and the order tax type is not mapped', async () => {
        await createConnection(DIST_A);
        const taxType = await prisma.taxType.create({
          data: { distributorId: DIST_A, name: 'Zero-rated', classification: TaxClassification.ZERO_RATED, ratePercentage: '0.00', active: true },
        });
        const order = await createOrderWithTaxLine(DIST_A, taxType.id);

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/accept`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(409);
        expect(res.body.title).toBe('TAX_TYPE_UNMAPPED');

        const inDb = await prisma.order.findUnique({ where: { id: order.id } });
        expect(inDb?.status).toBe(OrderStatus.SUBMITTED);
      });

      it('accepts when confirmUnmappedTaxTypes is true', async () => {
        await createConnection(DIST_A);
        const taxType = await prisma.taxType.create({
          data: { distributorId: DIST_A, name: 'Zero-rated', classification: TaxClassification.ZERO_RATED, ratePercentage: '0.00', active: true },
        });
        const order = await createOrderWithTaxLine(DIST_A, taxType.id);

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/accept`)
          .set('Authorization', `Bearer ${token}`)
          .send({ confirmUnmappedTaxTypes: true });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(OrderStatus.ACCEPTED);
      });

      it('accepts without a warning when the tax type has a confirmed mapping', async () => {
        const connection = await createConnection(DIST_A);
        const taxType = await prisma.taxType.create({
          data: { distributorId: DIST_A, name: 'Standard rate', classification: TaxClassification.STANDARD, ratePercentage: '20.00', active: true },
        });
        const external = await prisma.externalAccountingTaxType.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connection.id,
            provider: AccountingProvider.XERO,
            taxType: 'OUTPUT2',
            displayName: 'Standard rate',
            ratePercentage: '20.0000',
            lastSyncedAt: new Date(),
            rawProviderData: {},
          },
        });
        await prisma.taxTypeAccountingMapping.create({
          data: {
            distributorId: DIST_A,
            accountingConnectionId: connection.id,
            taxTypeId: taxType.id,
            externalTaxTypeId: external.id,
            matchMethod: AccountingTaxTypeMatchMethod.MANUAL,
            linkedByUserId: USER_A,
          },
        });
        const order = await createOrderWithTaxLine(DIST_A, taxType.id);

        const res = await request(app.getHttpServer())
          .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/accept`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(OrderStatus.ACCEPTED);
      });
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

  // ── GET /admin/distributors/:distributorId/orders/:id/audit-log ────────────

  describe('GET /api/v1/admin/distributors/:distributorId/orders/:id/audit-log', () => {
    it('records and returns an audit entry for a real accept call, attributed to the acting user', async () => {
      const order = await createOrder(DIST_A, OrderStatus.SUBMITTED);

      const acceptRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/accept`)
        .set('Authorization', `Bearer ${token}`);
      expect(acceptRes.status).toBe(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}/audit-log`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          entityType: 'ORDER',
          entityId: order.id,
          action: 'ORDER_ACCEPTED',
          actorType: 'USER',
          actorUserId: USER_A,
          actorName: 'Orders Admin',
          summary: 'Accepted the order',
        }),
      );
      expect(res.body.pagination).toEqual(
        expect.objectContaining({ hasMore: false, total: 1 }),
      );
    });

    it('returns 404 when the order belongs to a different distributor than the one in the path', async () => {
      const orderB = await createOrder(DIST_B, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${orderB.id}/audit-log`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller has no membership for the path distributor', async () => {
      const orderB = await createOrder(DIST_B, OrderStatus.SUBMITTED);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_B}/orders/${orderB.id}/audit-log`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("never leaks another distributor's audit entries, even for a same-named order under the caller's own distributor path", async () => {
      // DIST_A gets its own accepted order (one audit entry). DIST_B gets an
      // independently accepted order (its own audit entry). Confirms the
      // response for DIST_A's order is scoped to DIST_A's entityId/distributorId
      // and never includes DIST_B's row, proving the WHERE clause — not just
      // ownership of the order id — is what's filtering results.
      const orderA = await createOrder(DIST_A, OrderStatus.SUBMITTED);
      await request(app.getHttpServer())
        .post(`/api/v1/admin/distributors/${DIST_A}/orders/${orderA.id}/accept`)
        .set('Authorization', `Bearer ${token}`);

      const orderB = await createOrder(DIST_B, OrderStatus.SUBMITTED);
      await prisma.auditLog.create({
        data: {
          distributorId: DIST_B,
          entityType: 'ORDER',
          entityId: orderB.id,
          action: 'ORDER_ACCEPTED',
          actorType: 'USER',
          actorUserId: 'some-other-user',
          actorName: 'Someone Else',
          summary: 'Accepted the order',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${orderA.id}/audit-log`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data.every((e: { entityId: string }) => e.entityId === orderA.id)).toBe(true);
      expect(res.body.data.some((e: { actorName: string }) => e.actorName === 'Someone Else')).toBe(false);
    });
  });
});
