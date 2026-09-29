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
    await prisma.invoiceAnalyticsState.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
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
      (await prisma.accountingConnection.create({
        data: {
          distributorId,
          provider: AccountingProvider.XERO,
          status: AccountingConnectionStatus.CONNECTED,
          externalOrganisationId: `tenant-${distributorId}`,
          externalOrganisationName: 'Org',
          scopes: 'openid accounting.invoices',
          encryptedCredentialData: 'irrelevant',
          connectedByUserId: ADMIN_USER,
          connectedAt: new Date(),
        },
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
        accountingConnectionId: connection.id,
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
    expect(res.body.outstanding).toEqual({ amount: 120, count: 1 });
    expect(res.body.overdue).toMatchObject({ amount: 120, count: 1 });
    expect(res.body.openInvoices).toHaveLength(1);
    expect(res.body.openInvoices[0]).toMatchObject({ paymentStatus: 'UNPAID', isOverdue: true });
    expect(res.body.last90Days).toEqual({ paidCount: 0, averageDaysToPay: null, paidOnTimePercent: null });
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
