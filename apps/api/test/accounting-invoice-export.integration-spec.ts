/**
 * Integration tests for accounting invoice exports: verifies the DB-level
 * idempotency constraint (one export per connection+order), multi-tenancy on
 * the retry endpoint and connection-settings PATCH, and that the admin order
 * resource exposes the export only to the owning distributor — none of which
 * a mocked-Prisma unit test can prove.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import {
  AccountingConnectionStatus,
  AccountingInvoiceExportStatus,
  AccountingProvider,
  OrderStatus,
  OrganisationType,
  Prisma,
  Role,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-invexport-dist-a';
const DIST_B = 'test-invexport-dist-b';
const ADMIN_USER = 'test-invexport-admin';
const ADMIN_KEYCLOAK_ID = 'kc-test-invexport-admin';

describe('Accounting invoice exports (integration)', () => {
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
      create: { id: DIST_A, name: 'Invoice Export Test Distributor A', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: DIST_B },
      create: { id: DIST_B, name: 'Invoice Export Test Distributor B', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: {
        id: ADMIN_USER,
        email: 'invexport-admin@integration.test',
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

    token = jwtServer.signToken({ sub: ADMIN_KEYCLOAK_ID, email: 'invexport-admin@integration.test' });
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
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  });

  afterAll(async () => {
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await app.close();
    await jwtServer.close();
  });

  const createConnection = (distributorId: string) =>
    prisma.accountingConnection.create({
      data: {
        distributorId,
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId: 'tenant-1',
        externalOrganisationName: 'Acme Wines',
        scopes: 'openid accounting.invoices',
        encryptedCredentialData: 'irrelevant-for-this-test',
        connectedByUserId: ADMIN_USER,
        connectedAt: new Date(),
      },
    });

  const createOrder = async (distributorId: string) => {
    const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    return prisma.order.create({
      data: {
        distributorId,
        traderCustomerId: distributorId,
        placedByUserId: ADMIN_USER,
        orderNumber: `TEST-INVEXP-${seqResult[0].nextval}`,
        currency: 'GBP',
        status: OrderStatus.ACCEPTED,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('20.00'),
        totalAmount: new Prisma.Decimal('120.00'),
        acceptedAt: new Date(),
      },
    });
  };

  const createExport = (
    distributorId: string,
    connectionId: string,
    orderId: string,
    status: AccountingInvoiceExportStatus,
  ) =>
    prisma.accountingInvoiceExport.create({
      data: {
        distributorId,
        accountingConnectionId: connectionId,
        provider: AccountingProvider.XERO,
        orderId,
        status,
        ...(status === AccountingInvoiceExportStatus.FAILED
          ? { failedAt: new Date(), errorCode: 'CUSTOMER_NOT_MAPPED', errorMessage: 'not linked' }
          : {}),
      },
    });

  describe('unique (accountingConnectionId, orderId) — duplicate-invoice prevention', () => {
    it('rejects a second export row for the same connection and order', async () => {
      const connection = await createConnection(DIST_A);
      const order = await createOrder(DIST_A);
      await createExport(DIST_A, connection.id, order.id, AccountingInvoiceExportStatus.COMPLETED);

      await expect(
        createExport(DIST_A, connection.id, order.id, AccountingInvoiceExportStatus.PENDING),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('allows exports for the same order on different connections (reconnect history)', async () => {
      const connection = await createConnection(DIST_A);
      await prisma.accountingConnection.update({
        where: { id: connection.id },
        data: { status: AccountingConnectionStatus.DISCONNECTED, disconnectedAt: new Date() },
      });
      const newConnection = await createConnection(DIST_A);
      const order = await createOrder(DIST_A);
      await createExport(DIST_A, connection.id, order.id, AccountingInvoiceExportStatus.FAILED);

      await expect(
        createExport(DIST_A, newConnection.id, order.id, AccountingInvoiceExportStatus.PENDING),
      ).resolves.toBeDefined();
    });
  });

  describe('POST /distributors/:distributorId/accounting/invoice-exports/:exportId/retry', () => {
    it('queues a retry for a FAILED export by writing an outbox event', async () => {
      const connection = await createConnection(DIST_A);
      const order = await createOrder(DIST_A);
      const exportRow = await createExport(DIST_A, connection.id, order.id, AccountingInvoiceExportStatus.FAILED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/invoice-exports/${exportRow.id}/retry`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ status: 'requested' });

      const event = await prisma.outboxEvent.findFirst({
        where: { eventType: 'AccountingInvoiceExportRequested', aggregateId: order.id },
      });
      expect(event).toBeTruthy();
      expect(event!.payload).toMatchObject({ orderId: order.id, distributorId: DIST_A, exportId: exportRow.id });
    });

    it('rejects retrying an export that is not FAILED', async () => {
      const connection = await createConnection(DIST_A);
      const order = await createOrder(DIST_A);
      const exportRow = await createExport(DIST_A, connection.id, order.id, AccountingInvoiceExportStatus.COMPLETED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/invoice-exports/${exportRow.id}/retry`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
    });

    it("404s another distributor's export addressed through the caller's own path (cross-tenant probe)", async () => {
      const connectionB = await createConnection(DIST_B);
      const orderB = await createOrder(DIST_B);
      const exportB = await createExport(DIST_B, connectionB.id, orderB.id, AccountingInvoiceExportStatus.FAILED);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_A}/accounting/invoice-exports/${exportB.id}/retry`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      const event = await prisma.outboxEvent.findFirst({
        where: { eventType: 'AccountingInvoiceExportRequested', aggregateId: orderB.id },
      });
      expect(event).toBeNull();
    });

    it("403s the retry route under a distributor the admin doesn't belong to", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/distributors/${DIST_B}/accounting/invoice-exports/any-id/retry`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /distributors/:distributorId/accounting/connection', () => {
    it('updates the invoice target status on the caller-owned connection', async () => {
      await createConnection(DIST_A);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`)
        .send({ invoiceExportTargetStatus: 'AUTHORISED' });

      expect(res.status).toBe(200);
      expect(res.body.invoiceExportTargetStatus).toBe('AUTHORISED');

      const stored = await prisma.accountingConnection.findFirst({ where: { distributorId: DIST_A } });
      expect(stored!.invoiceExportTargetStatus).toBe('AUTHORISED');
    });

    it("403s a PATCH against a distributor the admin doesn't belong to", async () => {
      await createConnection(DIST_B);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_B}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`)
        .send({ invoiceExportTargetStatus: 'AUTHORISED' });

      expect(res.status).toBe(403);
      const stored = await prisma.accountingConnection.findFirst({ where: { distributorId: DIST_B } });
      expect(stored!.invoiceExportTargetStatus).toBe('DRAFT');
    });

    it('rejects an invalid target status value', async () => {
      await createConnection(DIST_A);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/distributors/${DIST_A}/accounting/connection`)
        .set('Authorization', `Bearer ${token}`)
        .send({ invoiceExportTargetStatus: 'PAID' });

      expect(res.status).toBe(400);
    });
  });

  describe('admin order resource exposes the export to the owning distributor only', () => {
    it('includes the latest invoice export on the order detail', async () => {
      const connection = await createConnection(DIST_A);
      const order = await createOrder(DIST_A);
      await createExport(DIST_A, connection.id, order.id, AccountingInvoiceExportStatus.FAILED);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_A}/orders/${order.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.invoiceExport).toMatchObject({
        status: 'FAILED',
        errorCode: 'CUSTOMER_NOT_MAPPED',
        provider: 'XERO',
      });
    });

    it("does not serve another distributor's order (and therefore its export)", async () => {
      const connectionB = await createConnection(DIST_B);
      const orderB = await createOrder(DIST_B);
      await createExport(DIST_B, connectionB.id, orderB.id, AccountingInvoiceExportStatus.COMPLETED);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/distributors/${DIST_B}/orders/${orderB.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
