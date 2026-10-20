/**
 * Integration tests for GET distributors/:distributorId/customers/:customerId/payments
 * (ADR-072): a customer shared by two distributors sees only each
 * distributor's own invoices and payment history, and a distributor admin
 * cannot read another distributor's view at all.
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
  AccountingInvoiceState,
  AccountingProvider,
  InvoicePaymentStatus,
  OrderStatus,
  OrganisationType,
  Prisma,
  Role,
  TradeRelationshipStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';
import { createAccountingConnection } from './support/accounting-fixtures';

const DIST_A = 'test-custpay-dist-a';
const DIST_B = 'test-custpay-dist-b';
const CUSTOMER = 'test-custpay-customer';
const ADMIN_USER = 'test-custpay-admin';
const ADMIN_KC = 'kc-test-custpay-admin';

describe('Customer payments (integration)', () => {
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

    for (const [id, type] of [
      [DIST_A, OrganisationType.DISTRIBUTOR],
      [DIST_B, OrganisationType.DISTRIBUTOR],
      [CUSTOMER, OrganisationType.TRADE_CUSTOMER],
    ] as const) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name: `CustPay ${id}`, type }, update: {} });
    }
    const user = await prisma.user.upsert({
      where: { id: ADMIN_USER },
      create: { id: ADMIN_USER, email: 'custpay-admin@integration.test', keycloakId: ADMIN_KC, firstName: 'C', lastName: 'P' },
      update: { keycloakId: ADMIN_KC },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: DIST_A } },
      create: { userId: user.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    token = jwtServer.signToken({ sub: ADMIN_KC, email: 'custpay-admin@integration.test' });
  });

  const cleanup = async () => {
    await prisma.ingestionRun.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.invoiceFact.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.invoiceAnalyticsState.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.orderAnalyticsState.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  };

  beforeEach(async () => {
    await cleanup();
    for (const distributorId of [DIST_A, DIST_B]) {
      await prisma.tradeRelationship.create({
        data: { distributorId, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.membership.deleteMany({ where: { userId: ADMIN_USER } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER] } } });
    await app.close();
    await jwtServer.close();
  });

  async function unpaidInvoice(distributorId: string, amountDue: string, dueDate: string) {
    const connection =
      (await prisma.accountingConnection.findFirst({ where: { distributorId } })) ??
      (await createAccountingConnection(prisma, {
          distributorId,
          provider: AccountingProvider.XERO,
          status: AccountingConnectionStatus.CONNECTED,
          externalOrganisationId: `tenant-${distributorId}`,
          externalOrganisationName: 'Org',
          scopes: 'openid accounting.invoices',
          encryptedCredentialData: 'irrelevant',
          connectedByUserId: ADMIN_USER,
          connectedAt: new Date(),
        }));
    const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const order = await prisma.order.create({
      data: {
        distributorId,
        traderCustomerId: CUSTOMER,
        placedByUserId: ADMIN_USER,
        orderNumber: `TEST-CUSTPAY-${nextval}`,
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
    await prisma.accountingInvoiceExport.create({
      data: {
        distributorId,
        accountingOrganisationId: connection.accountingOrganisationId,
        provider: AccountingProvider.XERO,
        orderId: order.id,
        status: AccountingInvoiceExportStatus.COMPLETED,
        externalInvoiceId: `inv-${order.id}`,
        invoiceState: AccountingInvoiceState.AWAITING_PAYMENT,
        invoiceTotal: '120.00',
        amountPaid: '0',
        amountCredited: '0',
        amountDue,
        dueDate: new Date(`${dueDate}T00:00:00Z`),
      },
    });
    return order;
  }

  it("shows a shared customer only this distributor's invoices and history", async () => {
    await unpaidInvoice(DIST_A, '120.00', '2020-01-01'); // long overdue
    await unpaidInvoice(DIST_B, '999.00', '2020-01-01'); // another distributor's — must not appear
    await prisma.invoiceAnalyticsState.create({
      data: {
        exportId: 'hist-b',
        distributorId: DIST_B,
        customerId: CUSTOMER,
        orderId: 'o-b',
        currency: 'GBP',
        status: InvoicePaymentStatus.PAID,
        total: '50',
        amountDue: '0',
        issueDate: new Date(),
        dueDate: new Date(),
        fullyPaidOn: new Date(),
        lastEventAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.outstanding).toEqual({ amounts: [{ currency: 'GBP', amount: 120 }], count: 1, orderCount: 1 });
    expect(res.body.overdue).toMatchObject({ amounts: [{ currency: 'GBP', amount: 120 }], count: 1 });
    expect(res.body.overdue.ageing.find((b: { bucket: string }) => b.bucket === '90+')).toMatchObject({ count: 1 });
    expect(res.body.openInvoices).toHaveLength(1);
    expect(res.body.openInvoices[0]).toMatchObject({ paymentStatus: 'UNPAID', isOverdue: true });
    expect(res.body.last90Days).toEqual({
      paidCount: 0,
      averageDaysToPay: null,
      averageDaysAllowed: null,
      averageDaysLate: null,
      paidOnTimePercent: null,
      trend: 'insufficient_history',
    });
    expect(res.body.invoiceTimeline).toEqual([expect.objectContaining({ paidOn: null, dueDate: '2020-01-01' })]);
    // Only this distributor's credit limit and balance.
    expect(res.body.credit).toMatchObject({ limit: null, used: { currency: 'GBP', amount: 120 } });
  });

  it("puts each raised invoice on the timeline with its order and payment dates, from this distributor's orders only", async () => {
    const day = (daysAgo: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - daysAgo));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const ownOrder = await unpaidInvoice(DIST_A, '0.00', '2020-01-01');
    const otherOrder = await unpaidInvoice(DIST_B, '0.00', '2020-01-01');
    // Both invoices have been paid in the accounting system.
    await prisma.accountingInvoiceExport.updateMany({
      where: { orderId: { in: [ownOrder.id, otherOrder.id] } },
      data: { invoiceState: AccountingInvoiceState.PAID },
    });
    await prisma.orderAnalyticsState.create({
      data: {
        orderId: ownOrder.id,
        distributorId: DIST_A,
        traderCustomerId: CUSTOMER,
        status: OrderStatus.ACCEPTED,
        subtotalAmount: '100.00',
        distributorLocalDate: day(40),
        lastEventAt: new Date(),
      },
    });
    const paid = (exportId: string, orderId: string) => ({
      exportId,
      distributorId: DIST_A,
      customerId: CUSTOMER,
      orderId,
      currency: 'GBP',
      status: InvoicePaymentStatus.PAID,
      total: '120',
      amountDue: '0',
      issueDate: day(40),
      dueDate: day(10),
      fullyPaidOn: day(5),
      lastEventAt: new Date(),
    });
    // The second row names another distributor's order: it must not be shown.
    await prisma.invoiceAnalyticsState.createMany({ data: [paid('paid-own', ownOrder.id), paid('paid-other', otherOrder.id)] });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.invoiceTimeline).toEqual([
      // The paid invoice; its order's own export is settled, so it is not also listed as unpaid.
      {
        orderId: ownOrder.id,
        orderNumber: ownOrder.orderNumber,
        orderedOn: iso(day(40)),
        dueDate: iso(day(10)),
        paidOn: iso(day(5)),
        daysLate: 5,
        currency: 'GBP',
        total: 120,
        amountDue: 0,
      },
    ]);
  });

  it("rebuilds what was overdue each day from this distributor's invoice facts only", async () => {
    const day = (daysAgo: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - daysAgo));
    const fact = (distributorId: string, amountDue: string) =>
      prisma.invoiceFact.create({
        data: {
          eventId: `custpay-fact-${distributorId}`,
          distributorId,
          exportId: `custpay-exp-${distributorId}`,
          orderId: `custpay-order-${distributorId}`,
          customerId: CUSTOMER,
          fromStatus: InvoicePaymentStatus.NOT_SYNCED,
          toStatus: InvoicePaymentStatus.UNPAID,
          invoiceState: AccountingInvoiceState.AWAITING_PAYMENT,
          currency: 'GBP',
          total: amountDue,
          amountPaid: '0',
          amountDue,
          dueDate: day(10),
          occurredAt: day(5),
          distributorLocalDate: day(5),
        },
      });
    await fact(DIST_A, '120.00');
    await fact(DIST_B, '999.00'); // another distributor's — must not appear

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const history = res.body.overdueHistory;
    expect(history.since).toBe(day(5).toISOString().slice(0, 10));
    expect(history.days).toHaveLength(6);
    expect(history.days.at(-1).buckets).toEqual({ '1-30': 120, '31-60': 0, '61-90': 0, '90+': 0 });
  });

  it("measures credit used against this distributor's limit and reports when invoices last synced", async () => {
    await prisma.tradeRelationship.update({
      where: { distributorId_customerId: { distributorId: DIST_A, customerId: CUSTOMER } },
      data: { creditLimit: new Prisma.Decimal('500.00') },
    });
    await prisma.tradeRelationship.update({
      where: { distributorId_customerId: { distributorId: DIST_B, customerId: CUSTOMER } },
      data: { creditLimit: new Prisma.Decimal('99999.00') },
    });
    const order = await unpaidInvoice(DIST_A, '120.00', '2099-01-01'); // not yet due
    const connection = await prisma.accountingConnection.findFirstOrThrow({ where: { distributorId: DIST_A } });
    await prisma.ingestionRun.create({
      data: {
        distributorId: DIST_A,
        sourceType: 'accounting',
        sourceRef: connection.id,
        resourceType: 'invoice',
        trigger: 'SCHEDULED',
        status: 'COMPLETED',
        lastSucceededAt: new Date('2026-10-17T09:45:00Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.credit).toEqual({
      limit: { currency: 'GBP', amount: 500 },
      used: { currency: 'GBP', amount: 120 },
      available: { currency: 'GBP', amount: 380 },
      usedPercent: 24,
      overLimit: false,
    });
    expect(res.body.overdue).toMatchObject({ count: 0, oldest: null });
    expect(res.body.outstanding.orderCount).toBe(1);
    expect(res.body.openInvoices[0].orderId).toBe(order.id);
    expect(res.body.accountingSync).toEqual({ connected: true, lastSyncedAt: '2026-10-17T09:45:00.000Z' });
  });

  it("counts this distributor's accepted orders not yet invoiced, since accounting was connected", async () => {
    await unpaidInvoice(DIST_A, '120.00', '2099-01-01'); // invoiced — not counted; also makes the connection
    await unpaidInvoice(DIST_B, '120.00', '2099-01-01');
    const connection = await prisma.accountingConnection.findFirstOrThrow({ where: { distributorId: DIST_A } });
    const uninvoicedOrder = async (distributorId: string, totalAmount: string, status: OrderStatus, acceptedAt: Date) => {
      const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
      await prisma.order.create({
        data: {
          distributorId,
          traderCustomerId: CUSTOMER,
          placedByUserId: ADMIN_USER,
          orderNumber: `TEST-CUSTPAY-${nextval}`,
          currency: 'GBP',
          status,
          acceptanceModeSnapshot: 'MANUAL',
          acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
          subtotalAmount: new Prisma.Decimal(totalAmount),
          taxAmount: new Prisma.Decimal('0'),
          totalAmount: new Prisma.Decimal(totalAmount),
          acceptedAt,
        },
      });
    };
    const afterConnecting = new Date(connection.connectedAt.getTime() + 60_000);
    await uninvoicedOrder(DIST_A, '75.00', OrderStatus.ACCEPTED, afterConnecting);
    await uninvoicedOrder(DIST_A, '25.00', OrderStatus.DELIVERED, afterConnecting);
    await uninvoicedOrder(DIST_A, '500.00', OrderStatus.CANCELLED, afterConnecting); // never invoiced
    await uninvoicedOrder(DIST_A, '300.00', OrderStatus.COMPLETED, new Date(connection.connectedAt.getTime() - 86_400_000)); // before connecting
    await uninvoicedOrder(DIST_B, '999.00', OrderStatus.ACCEPTED, afterConnecting); // another distributor's

    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.notYetInvoiced).toEqual({ amounts: [{ currency: 'GBP', amount: 100 }], count: 2 });
  });

  it('reports accounting as not connected when there is no connection', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.accountingSync).toEqual({ connected: false, lastSyncedAt: null });
    expect(res.body.notYetInvoiced).toEqual({ amounts: [], count: 0 });
  });

  it("refuses another distributor's view of the same customer", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_B}/customers/${CUSTOMER}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('404s for an organisation that is not this distributor\'s customer', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/distributors/${DIST_A}/customers/${DIST_B}/payments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
