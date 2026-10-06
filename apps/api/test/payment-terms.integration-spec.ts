/**
 * Integration tests for payment terms (ADR-075).
 *
 * Real database: proves distributor isolation of terms and of assigning them
 * to customers, and that the built-in accounting-software term is one per
 * distributor even under concurrent first use.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { OrderStatus, OrganisationType, PaymentTermType, Prisma, Role, TradeRelationshipStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { startJwtTestServer, JwtTestServer } from './helpers/jwt-test-server';

const DIST_A = 'test-integration-payterm-dist-a';
const DIST_B = 'test-integration-payterm-dist-b';
const CUSTOMER = 'test-integration-payterm-customer';
const ADMIN_A = 'test-payterm-admin-a';
const ADMIN_A_KEYCLOAK_ID = 'kc-test-payterm-admin-a';

describe('Payment terms (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtServer: JwtTestServer;
  let token: string;

  const api = () => request(app.getHttpServer());
  const auth = { Authorization: '' };

  const cleanTerms = async () => {
    const orders = await prisma.order.findMany({ where: { distributorId: DIST_A }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orders.map((o) => o.id) } } });
    await prisma.auditLog.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.notification.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.order.deleteMany({ where: { distributorId: DIST_A } });
    await prisma.traderCustomerSettings.deleteMany({
      where: { tradeRelationship: { distributorId: { in: [DIST_A, DIST_B] } } },
    });
    await prisma.distributorSettings.updateMany({
      where: { distributorId: { in: [DIST_A, DIST_B] } },
      data: { defaultPaymentTermId: null },
    });
    await prisma.paymentTerm.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  };

  beforeAll(async () => {
    jwtServer = await startJwtTestServer();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    for (const [id, name, type] of [
      [DIST_A, 'PayTerm Distributor A', OrganisationType.DISTRIBUTOR],
      [DIST_B, 'PayTerm Distributor B', OrganisationType.DISTRIBUTOR],
      [CUSTOMER, 'PayTerm Customer', OrganisationType.TRADE_CUSTOMER],
    ] as const) {
      await prisma.organisation.upsert({ where: { id }, create: { id, name, type }, update: {} });
    }
    await prisma.tradeRelationship.upsert({
      where: { distributorId_customerId: { distributorId: DIST_A, customerId: CUSTOMER } },
      create: { distributorId: DIST_A, customerId: CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
      update: { deletedAt: null },
    });
    const admin = await prisma.user.upsert({
      where: { id: ADMIN_A },
      create: {
        id: ADMIN_A,
        email: 'payterm-admin@integration.test',
        keycloakId: ADMIN_A_KEYCLOAK_ID,
        firstName: 'PayTerm',
        lastName: 'Admin',
      },
      update: { keycloakId: ADMIN_A_KEYCLOAK_ID },
    });
    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: admin.id, organisationId: DIST_A } },
      create: { userId: admin.id, organisationId: DIST_A, role: Role.DISTRIBUTOR_ADMIN },
      update: {},
    });
    token = jwtServer.signToken({ sub: ADMIN_A_KEYCLOAK_ID, email: 'payterm-admin@integration.test' });
    auth.Authorization = `Bearer ${token}`;
  });

  afterAll(async () => {
    await cleanTerms();
    await prisma.distributorSettings.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.membership.deleteMany({ where: { userId: ADMIN_A } });
    await prisma.user.deleteMany({ where: { id: ADMIN_A } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B, CUSTOMER] } } });
    await app.close();
    await jwtServer.close();
  });

  beforeEach(cleanTerms);

  const termOfB = () =>
    prisma.paymentTerm.create({
      data: { distributorId: DIST_B, name: 'B Net 7', type: PaymentTermType.DAYS_AFTER_INVOICE, days: 7 },
    });

  it('lists only the distributor\'s own terms, with its built-in term as the default', async () => {
    await termOfB();
    await prisma.paymentTerm.create({
      data: { distributorId: DIST_A, name: 'A Net 30', type: PaymentTermType.DAYS_AFTER_INVOICE, days: 30 },
    });

    const res = await api().get(`/api/v1/distributors/${DIST_A}/payment-terms`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: any) => t.name)).toEqual(['A Net 30', 'Set by accounting software']);
    expect(res.body.data[1]).toMatchObject({ isSystem: true, isDefault: true });
    expect(res.body.accountingProvider).toBeNull();
  });

  it('creates exactly one built-in term under concurrent first use', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api().get(`/api/v1/distributors/${DIST_A}/payment-terms`).set(auth)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(
      await prisma.paymentTerm.count({ where: { distributorId: DIST_A, type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT } }),
    ).toBe(1);
  });

  it('refuses a second built-in term at the database, whatever writes it', async () => {
    const row = { distributorId: DIST_A, name: 'x', type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT, systemKey: 'ACCOUNTING_SYSTEM_DEFAULT' };
    await prisma.paymentTerm.create({ data: row });
    await expect(prisma.paymentTerm.create({ data: row })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('cannot read, change, default or deactivate another distributor\'s term', async () => {
    const b = await termOfB();
    const base = `/api/v1/distributors/${DIST_A}/payment-terms/${b.id}`;

    expect((await api().get(base).set(auth)).status).toBe(404);
    expect((await api().patch(base).set(auth).send({ name: 'hijacked' })).status).toBe(404);
    expect((await api().patch(base).set(auth).send({ isDefault: true })).status).toBe(404);
    expect((await api().delete(base).set(auth)).status).toBe(404);

    const after = await prisma.paymentTerm.findUniqueOrThrow({ where: { id: b.id } });
    expect(after).toMatchObject({ name: 'B Net 7', active: true });
    const settingsA = await prisma.distributorSettings.findUnique({ where: { distributorId: DIST_A } });
    expect(settingsA?.defaultPaymentTermId ?? null).toBeNull();
  });

  it('cannot use another distributor\'s endpoint', async () => {
    expect((await api().get(`/api/v1/distributors/${DIST_B}/payment-terms`).set(auth)).status).toBe(403);
  });

  it('cannot assign another distributor\'s term to its customer', async () => {
    const b = await termOfB();

    const res = await api()
      .patch(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}`)
      .set(auth)
      .send({ paymentTermId: b.id });

    expect(res.status).toBe(400);
    const settings = await prisma.traderCustomerSettings.findFirst({
      where: { tradeRelationship: { distributorId: DIST_A, customerId: CUSTOMER } },
    });
    expect(settings?.paymentTermId ?? null).toBeNull();
  });

  it('assigns a term to a customer, then moves them to the default when it is deactivated', async () => {
    const created = await api()
      .post(`/api/v1/distributors/${DIST_A}/payment-terms`)
      .set(auth)
      .send({ name: 'Weekly Friday', type: 'DAY_OF_WEEK', dayOfWeek: 5 });
    expect(created.status).toBe(201);
    expect(created.body.summary).toBe('The next Friday after the invoice date');

    const assigned = await api()
      .patch(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}`)
      .set(auth)
      .send({ paymentTermId: created.body.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.paymentTerm).toMatchObject({ id: created.body.id, name: 'Weekly Friday' });

    const deactivated = await api().delete(`/api/v1/distributors/${DIST_A}/payment-terms/${created.body.id}`).set(auth);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body).toMatchObject({ active: false, customerCount: 0 });

    const customer = await api().get(`/api/v1/distributors/${DIST_A}/customers/${CUSTOMER}`).set(auth);
    expect(customer.body.paymentTermId).toBeNull();
  });

  it('makes a term the default and refuses to deactivate it while it is', async () => {
    const created = await api()
      .post(`/api/v1/distributors/${DIST_A}/payment-terms`)
      .set(auth)
      .send({ name: '30 EOM', type: 'DAYS_AFTER_MONTH_END', days: 30, makeDefault: true });
    expect(created.body.isDefault).toBe(true);

    const list = await api().get(`/api/v1/distributors/${DIST_A}/payment-terms`).set(auth);
    expect(list.body.defaultPaymentTermId).toBe(created.body.id);
    expect(list.body.data.filter((t: any) => t.isDefault)).toHaveLength(1);

    const res = await api().delete(`/api/v1/distributors/${DIST_A}/payment-terms/${created.body.id}`).set(auth);
    expect(res.status).toBe(422);
  });

  it('freezes the due date onto an order at acceptance; later term edits do not move it', async () => {
    await prisma.distributorSettings.upsert({
      where: { distributorId: DIST_A },
      create: { distributorId: DIST_A, timezone: 'Europe/London' },
      update: { timezone: 'Europe/London' },
    });
    const term = await api()
      .post(`/api/v1/distributors/${DIST_A}/payment-terms`)
      .set(auth)
      .send({ name: 'Net 30', type: 'DAYS_AFTER_INVOICE', days: 30, makeDefault: true });
    const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const order = await prisma.order.create({
      data: {
        distributorId: DIST_A,
        traderCustomerId: CUSTOMER,
        placedByUserId: ADMIN_A,
        orderNumber: `TEST-PT-${nextval}`,
        status: OrderStatus.SUBMITTED,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('10.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('10.00'),
        submittedAt: new Date(),
      },
    });

    const pending = await api().get(`/api/v1/distributors/${DIST_A}/orders/${order.id}`).set(auth);
    expect(pending.body.paymentTerms).toMatchObject({ calculated: false, term: { name: 'Net 30' }, dueDate: null });

    const accepted = await api().post(`/api/v1/distributors/${DIST_A}/orders/${order.id}/accept`).set(auth).send({});
    expect(accepted.status).toBe(200);

    const londonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const due = new Date(`${londonToday}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 30);
    const expected = {
      calculated: true,
      invoiceDate: londonToday,
      dueDate: due.toISOString().slice(0, 10),
      term: { id: term.body.id, name: 'Net 30', summary: '30 days after the invoice date' },
      source: 'DISTRIBUTOR_DEFAULT',
    };
    expect((await api().get(`/api/v1/distributors/${DIST_A}/orders/${order.id}`).set(auth)).body.paymentTerms).toMatchObject(expected);

    // The distributor changes the term afterwards — the accepted order keeps its dates.
    await api().patch(`/api/v1/distributors/${DIST_A}/payment-terms/${term.body.id}`).set(auth).send({ name: 'Net 7', days: 7 });
    expect((await api().get(`/api/v1/distributors/${DIST_A}/orders/${order.id}`).set(auth)).body.paymentTerms).toMatchObject(expected);
  });
});
