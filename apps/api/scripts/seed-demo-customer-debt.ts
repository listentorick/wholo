/**
 * Gives one customer a history of paying promptly, then paying off overdue
 * invoices over three months, so the customer Dashboard's Overdue balances chart and Payment
 * behaviour card have something to show (ADR-077). The story is
 * src/demo-data/demo-debt.plan.ts; this writes it.
 *
 * LOCAL ONLY. It writes orders, order analytics, invoice facts and the paid
 * invoices' analytics state, all with ids starting "demo-debt-", and deletes
 * its own earlier rows first, so it can be run again. Nothing else is
 * touched: no accounting export rows (the invoices never reach the accounting
 * system, so the status sync ignores them) and no outbox events.
 *
 * Everything is relative to today. db:demo:dashboards deletes every fact the
 * distributor has, so run this after it.
 *
 * Usage: pnpm --filter @wholo/api db:demo:debt [customerId]   (default: The Blackbird Restaurant, seed-tc-org-1)
 * Requires DATABASE_URL (port-forward Postgres first: pnpm k8s:pf:postgres).
 */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { distributorLocalDate } from '../src/common/distributor-local-date';
import { buildDebtPlan, PAYMENT_COUNT } from '../src/demo-data/demo-debt.plan';

const DISTRIBUTOR_ID = 'seed-distributor-1';
const DEFAULT_CUSTOMER_ID = 'seed-tc-org-1';
const ID_PREFIX = 'demo-debt-';
const DAY_MS = 24 * 60 * 60 * 1000;
const TAX_RATE = 0.2;

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to run against "${host}": this script writes demo data and is for a local database only`);
  }
}

const pounds = (pence: number): Prisma.Decimal => new Prisma.Decimal(pence).div(100);

async function main() {
  assertLocalDatabase();
  const customerId = process.argv[2] ?? DEFAULT_CUSTOMER_ID;
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const relationship = await prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId: DISTRIBUTOR_ID, customerId } },
      include: { customer: { select: { name: true } } },
    });
    if (!relationship) throw new Error(`${customerId} is not a customer of ${DISTRIBUTOR_ID}`);
    const buyer = await prisma.membership.findFirst({ where: { organisationId: customerId }, select: { userId: true } });
    const staff = await prisma.membership.findFirst({ where: { organisationId: DISTRIBUTOR_ID }, orderBy: { createdAt: 'asc' }, select: { userId: true } });
    const placedByUserId = buyer?.userId ?? staff?.userId;
    if (!placedByUserId) throw new Error('No user to place the orders as');
    const settings = await prisma.distributorSettings.findUnique({ where: { distributorId: DISTRIBUTOR_ID }, select: { timezone: true } });
    const today = distributorLocalDate(new Date(), settings?.timezone ?? 'UTC');
    const day = (daysAgo: number) => new Date(today.getTime() - daysAgo * DAY_MS);
    // Mid-morning on the day, so the instant falls on that calendar date in any UK time.
    const at = (daysAgo: number) => new Date(day(daysAgo).getTime() + 10 * 60 * 60 * 1000);

    const plan = buildDebtPlan();
    const orderId = (i: number) => `${ID_PREFIX}order-${customerId}-${i + 1}`;
    const exportId = (i: number) => `${ID_PREFIX}export-${customerId}-${i + 1}`;

    await prisma.$transaction(async (tx) => {
      const mine = { startsWith: ID_PREFIX };
      await tx.invoiceFact.deleteMany({ where: { distributorId: DISTRIBUTOR_ID, eventId: mine } });
      await tx.invoiceAnalyticsState.deleteMany({ where: { distributorId: DISTRIBUTOR_ID, exportId: mine } });
      await tx.orderAnalyticsState.deleteMany({ where: { distributorId: DISTRIBUTOR_ID, orderId: mine } });
      await tx.order.deleteMany({ where: { distributorId: DISTRIBUTOR_ID, id: mine } });

      for (const inv of plan.invoices) {
        const total = inv.totalPence;
        const subtotal = Math.round(total / (1 + TAX_RATE));
        // Numbered the way OrdersService numbers real orders, from the same sequence.
        const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
        const orderNumber = `ORD-${day(inv.raisedDaysAgo).getUTCFullYear()}-${String(nextval).padStart(5, '0')}`;
        await tx.order.create({
          data: {
            id: orderId(inv.index),
            distributorId: DISTRIBUTOR_ID,
            traderCustomerId: customerId,
            placedByUserId,
            orderNumber,
            currency: 'GBP',
            status: 'COMPLETED',
            acceptanceModeSnapshot: 'MANUAL',
            acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
            subtotalAmount: pounds(subtotal),
            taxAmount: pounds(total - subtotal),
            totalAmount: pounds(total),
            submittedAt: at(inv.raisedDaysAgo),
            acceptedAt: at(inv.raisedDaysAgo),
            createdAt: at(inv.raisedDaysAgo),
          },
        });
        await tx.orderAnalyticsState.create({
          data: {
            orderId: orderId(inv.index),
            distributorId: DISTRIBUTOR_ID,
            traderCustomerId: customerId,
            status: 'COMPLETED',
            subtotalAmount: pounds(subtotal),
            distributorLocalDate: day(inv.raisedDaysAgo),
            lastEventAt: at(inv.raisedDaysAgo),
          },
        });
        const paidDaysAgo = plan.paidDaysAgo.get(inv.index)!;
        await tx.invoiceAnalyticsState.create({
          data: {
            exportId: exportId(inv.index),
            distributorId: DISTRIBUTOR_ID,
            customerId,
            orderId: orderId(inv.index),
            currency: 'GBP',
            status: 'PAID',
            total: pounds(total),
            amountDue: pounds(0),
            issueDate: day(inv.raisedDaysAgo),
            dueDate: day(inv.dueDaysAgo),
            fullyPaidOn: day(paidDaysAgo),
            lastEventAt: at(paidDaysAgo),
          },
        });
      }

      await tx.invoiceFact.createMany({
        data: plan.events.map((e, n) => {
          const inv = plan.invoices[e.invoice];
          return {
            eventId: `${ID_PREFIX}${customerId}-${n + 1}`,
            distributorId: DISTRIBUTOR_ID,
            exportId: exportId(inv.index),
            orderId: orderId(inv.index),
            customerId,
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            invoiceState: e.toStatus === 'PAID' ? 'PAID' : 'AWAITING_PAYMENT',
            currency: 'GBP',
            total: pounds(inv.totalPence),
            amountPaid: pounds(e.amountPaidPence),
            amountDue: pounds(e.amountDuePence),
            issueDate: day(inv.raisedDaysAgo),
            dueDate: day(inv.dueDaysAgo),
            fullyPaidOn: e.toStatus === 'PAID' ? day(e.daysAgo) : null,
            occurredAt: at(e.daysAgo),
            distributorLocalDate: day(e.daysAgo),
          };
        }),
      });
    });

    const debts = plan.invoices.filter((inv) => inv.kind === 'debt');
    const total = debts.reduce((sum, inv) => sum + inv.totalPence, 0);
    console.log(
      `${relationship.customer.name}: ${debts.length} invoices (£${(total / 100).toFixed(2)}) raised ` +
        `${debts[0].raisedDaysAgo}–${debts.at(-1)!.raisedDaysAgo} days ago, paid off in ${PAYMENT_COUNT} weekly payments ` +
        `ending ${Math.min(...plan.paidDaysAgo.values())} days ago; ${plan.invoices.length - debts.length} earlier invoices paid a few days late before that.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
