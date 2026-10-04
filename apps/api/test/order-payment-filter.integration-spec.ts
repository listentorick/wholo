/**
 * Integration test for the admin order list's payment filter (ADR-072):
 * against a real database, each payment position returns exactly the orders
 * whose badge shows that position — Overdue replaces Unpaid / Part paid, a
 * missing due date is never overdue — and several positions match any of them.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { Test } from '@nestjs/testing';
import {
  AccountingConnectionStatus,
  AccountingInvoiceExportStatus,
  AccountingInvoiceState,
  AccountingProvider,
  OrderStatus,
  OrganisationType,
  Prisma,
} from '@prisma/client';
import type { OrderPaymentFilter } from '@wholo/types';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { paymentFilterWhere } from '../src/accounting/order-invoice-payment';
import { derivePaymentStatus, isOverdue } from '../src/accounting/invoice-payment-status';
import { createAccountingConnection } from './support/accounting-fixtures';

const DIST = 'test-payfilter-dist';
const USER = 'test-payfilter-user';
const TODAY = '2026-10-01';
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// name → export payment facts, and the badge that order shows.
const CASES: Array<{ name: string; badge: OrderPaymentFilter | 'VOID'; facts: Record<string, unknown> }> = [
  { name: 'unpaid-not-due', badge: 'UNPAID', facts: { invoiceState: 'AWAITING_PAYMENT', amountPaid: 0, amountDue: 100, dueDate: day('2026-10-15') } },
  { name: 'unpaid-due-today', badge: 'UNPAID', facts: { invoiceState: 'AWAITING_PAYMENT', amountPaid: 0, amountDue: 100, dueDate: day(TODAY) } },
  { name: 'unpaid-no-due-date', badge: 'UNPAID', facts: { invoiceState: 'AWAITING_PAYMENT', amountPaid: 0, amountDue: 100, dueDate: null } },
  { name: 'unpaid-draft', badge: 'UNPAID', facts: { invoiceState: 'DRAFT', amountPaid: 0, amountDue: 100, dueDate: day('2026-09-01') } },
  { name: 'unpaid-overdue', badge: 'OVERDUE', facts: { invoiceState: 'AWAITING_PAYMENT', amountPaid: 0, amountDue: 100, dueDate: day('2026-09-30') } },
  { name: 'part-paid-not-due', badge: 'PART_PAID', facts: { invoiceState: 'AWAITING_PAYMENT', amountPaid: 40, amountDue: 60, dueDate: day('2026-10-15') } },
  { name: 'part-paid-overdue', badge: 'OVERDUE', facts: { invoiceState: 'AWAITING_PAYMENT', amountPaid: 40, amountDue: 60, dueDate: day('2026-09-01') } },
  { name: 'paid', badge: 'PAID', facts: { invoiceState: 'PAID', amountPaid: 100, amountDue: 0, dueDate: day('2026-09-01') } },
  { name: 'paid-nothing-due', badge: 'PAID', facts: { invoiceState: 'AWAITING_PAYMENT', amountPaid: 100, amountDue: 0, dueDate: day('2026-09-01') } },
  { name: 'void', badge: 'VOID', facts: { invoiceState: 'VOIDED', amountPaid: 0, amountDue: 0, dueDate: day('2026-09-01') } },
];

describe('Order payment filter (integration)', () => {
  let prisma: PrismaService;
  let close: () => Promise<void>;
  const orderIdByName = new Map<string, string>();

  const cleanup = async () => {
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: DIST } });
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = module.get(PrismaService);
    close = () => module.close();
    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'Payment Filter Test', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER },
      create: { id: USER, email: 'payfilter@integration.test', keycloakId: 'kc-payfilter', firstName: 'P', lastName: 'F' },
      update: {},
    });
    await cleanup();

    const connection = await createAccountingConnection(prisma, {
        distributorId: DIST,
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId: 'tenant-payfilter',
        externalOrganisationName: 'Org',
        scopes: 'openid accounting.invoices',
        encryptedCredentialData: 'irrelevant',
        connectedByUserId: USER,
        connectedAt: new Date(),
      });
    for (const c of CASES) {
      const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
      const order = await prisma.order.create({
        data: {
          distributorId: DIST,
          traderCustomerId: DIST,
          placedByUserId: USER,
          orderNumber: `TEST-PAYFILTER-${nextval}`,
          currency: 'GBP',
          status: OrderStatus.ACCEPTED,
          acceptanceModeSnapshot: 'MANUAL',
          acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
          subtotalAmount: new Prisma.Decimal('100.00'),
          taxAmount: new Prisma.Decimal('0.00'),
          totalAmount: new Prisma.Decimal('100.00'),
        },
      });
      await prisma.accountingInvoiceExport.create({
        data: {
          distributorId: DIST,
          accountingOrganisationId: connection.accountingOrganisationId,
          provider: AccountingProvider.XERO,
          orderId: order.id,
          status: AccountingInvoiceExportStatus.COMPLETED,
          externalInvoiceId: `inv-${c.name}`,
          invoiceTotal: 100,
          amountCredited: 0,
          ...(c.facts as { invoiceState: AccountingInvoiceState }),
        },
      });
      orderIdByName.set(c.name, order.id);
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.organisation.deleteMany({ where: { id: DIST } });
    await close();
  });

  const matching = async (filters: OrderPaymentFilter[]) => {
    const rows = await prisma.order.findMany({
      where: { distributorId: DIST, ...paymentFilterWhere(filters, TODAY) },
      select: { id: true },
    });
    const names = new Map([...orderIdByName].map(([name, id]) => [id, name]));
    return rows.map((r) => names.get(r.id)).sort();
  };
  // The badge each order shows, from the same functions the order read model
  // uses (Overdue replaces Unpaid / Part paid) — and it must agree with the
  // label written next to each case.
  const badgeOf = (facts: Record<string, unknown>) => {
    const f = { invoiceTotal: 100, amountCredited: 0, ...facts } as Parameters<typeof derivePaymentStatus>[0];
    return isOverdue(f, TODAY) ? 'OVERDUE' : derivePaymentStatus(f);
  };
  const withBadge = (...badges: string[]) => CASES.filter((c) => badges.includes(badgeOf(c.facts))).map((c) => c.name).sort();

  it('labels each case with the badge the order actually shows', () => {
    for (const c of CASES) expect({ name: c.name, badge: badgeOf(c.facts) }).toEqual({ name: c.name, badge: c.badge });
  });

  it.each(['UNPAID', 'PART_PAID', 'PAID', 'OVERDUE'] as const)('%s returns exactly the orders badged that way', async (filter) => {
    expect(await matching([filter])).toEqual(withBadge(filter));
  });

  it('several positions return the orders matching any of them', async () => {
    expect(await matching(['UNPAID', 'OVERDUE'])).toEqual(withBadge('UNPAID', 'OVERDUE'));
  });
});
