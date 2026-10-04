/**
 * ADR-073: invoice export never raises a second invoice for an order.
 *
 * This spec is the regression guard for that decision. It drives the real
 * export processor, against a real database and a fake provider that keeps a
 * ledger of the invoices it holds, through EVERY sequence of the things that
 * can go wrong between "order accepted" and "invoice recorded" — and after
 * each step asks the provider how many live invoices it holds for the order.
 * The answer must never be more than one.
 *
 * The provider forgets its idempotency keys after every step (Xero forgets
 * them after 6 minutes), so nothing here can pass by leaning on them.
 *
 * If a change makes this spec fail, the change is wrong — not the spec.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccountingConnection,
  AccountingConnectionStatus,
  AccountingContactMatchMethod,
  AccountingInvoiceExportStatus,
  AccountingProvider,
  Order,
  OrderLineStatus,
  OrderStatus,
  OrganisationType,
  Prisma,
  TradeRelationship,
} from '@prisma/client';
import { Job } from 'bullmq';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccountingConnectionService } from '../src/accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../src/accounting/adapters/accounting-adapter.registry';
import { AccountingTaxTypeService } from '../src/accounting/accounting-tax-type.service';
import { TokenEncryptionService } from '../src/accounting/token-encryption.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { AuditService } from '../src/audit/audit.service';
import { AdminNotificationsService } from '../src/admin-notifications/admin-notifications.service';
import { AccountingInvoiceExportProcessor } from '../src/accounting-invoice-export/accounting-invoice-export.processor';
import { FakeAccountingAdapter } from './support/fake-accounting.adapter';
import { createAccountingConnection } from './support/accounting-fixtures';

const DIST = 'test-nodup-dist';
const CUSTOMER = 'test-nodup-customer';
const USER = 'test-nodup-user';

// Everything that can happen to one export attempt.
const STEPS = [
  'succeeds', // nothing goes wrong
  'created-then-no-answer', // the provider creates the invoice; the call fails (timeout, 5xx, dropped connection)
  'created-then-save-fails', // the provider creates the invoice; our own save of the result fails
  'rejected', // the provider refuses the invoice; nothing is created
  'never-sent', // the request never reaches the provider
  'worker-dies', // the provider creates the invoice; the worker dies before recording anything
  'record-lost', // our export record disappears (database restore, manual fix)
  'reconnected', // the distributor disconnects and reconnects the same organisation
] as const;
type Step = (typeof STEPS)[number];

// Every sequence of 1, 2 and 3 steps.
const schedulesStartingWith = (first: Step): Step[][] => [
  [first],
  ...STEPS.map((second) => [first, second]),
  ...STEPS.flatMap((second) => STEPS.map((third) => [first, second, third])),
];

describe('Invoice export never raises a second invoice for an order (ADR-073, integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let fake: FakeAccountingAdapter;
  let invoiceExport: AccountingInvoiceExportProcessor;
  let tradeRelationship: TradeRelationship;
  let order: Order;
  let failNextSave = false;
  let connectionSequence = 0;

  const exportJob = () =>
    ({
      id: 'job-1',
      name: 'OrderAccepted',
      data: { eventId: `evt-${Math.random()}`, aggregateType: 'Order', aggregateId: order.id, payload: { orderId: order.id, distributorId: DIST } },
      attemptsMade: 0,
      opts: { attempts: 3 },
    }) as unknown as Job;

  const activeConnection = (): Promise<AccountingConnection> =>
    prisma.accountingConnection.findFirstOrThrow({
      where: { distributorId: DIST, status: AccountingConnectionStatus.CONNECTED },
    });

  // A connected accounting organisation with the customer linked to a contact —
  // everything an export needs. A reconnect to the same organisation keeps
  // the link it already has (ADR-074), so the link is made only once.
  const connect = async () => {
    connectionSequence += 1;
    const connection = await createAccountingConnection(prisma, {
        distributorId: DIST,
        provider: AccountingProvider.XERO, // the only enum value today; every call goes to the fake
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId: 'fake-org-1',
        externalOrganisationName: 'Fake Books Organisation',
        scopes: 'fake.all',
        encryptedCredentialData: module
          .get(TokenEncryptionService, { strict: false })
          .encrypt(JSON.stringify(FakeAccountingAdapter.tokenSet())),
        connectedByUserId: USER,
        connectedAt: new Date(),
      });
    const linked = await prisma.customerAccountingMapping.findFirst({
      where: { accountingOrganisationId: connection.accountingOrganisationId, unlinkedAt: null },
    });
    if (linked) return;
    const contact = await prisma.externalAccountingContact.create({
      data: {
        distributorId: DIST,
        accountingOrganisationId: connection.accountingOrganisationId,
        provider: AccountingProvider.XERO,
        externalContactId: `fake-contact-${connectionSequence}`,
        displayName: 'The Old Hall',
        lastSyncedAt: new Date(),
        rawProviderData: {},
      },
    });
    await prisma.customerAccountingMapping.create({
      data: {
        distributorId: DIST,
        accountingOrganisationId: connection.accountingOrganisationId,
        tradeRelationshipId: tradeRelationship.id,
        externalContactId: contact.id,
        matchMethod: AccountingContactMatchMethod.MANUAL,
        linkedByUserId: USER,
      },
    });
  };

  const clearExportState = async () => {
    const exports = await prisma.accountingInvoiceExport.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const connections = await prisma.accountingConnection.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const orders = await prisma.order.findMany({ where: { distributorId: DIST }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...exports, ...connections, ...orders].map((r) => r.id) } },
    });
    await prisma.auditLog.deleteMany({ where: { distributorId: DIST } });
    await prisma.adminNotification.deleteMany({ where: { organisationId: DIST } });
    // A running scheduler (local cluster) may have queued syncs for the test connections.
    await prisma.ingestionRun.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: DIST } });
    await prisma.customerAccountingMapping.deleteMany({ where: { distributorId: DIST } });
    await prisma.externalAccountingContact.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: DIST } });
  };

  const cleanup = async () => {
    await clearExportState();
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
    await prisma.product.deleteMany({ where: { distributorId: DIST } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: DIST } });
  };

  // A fresh start for one schedule: an accepted order, a connected
  // organisation, no export yet, and a provider holding nothing.
  const reset = async () => {
    await clearExportState();
    fake.reset();
    failNextSave = false;
    await connect();
  };

  const run = () => invoiceExport.process(exportJob());
  // An attempt that is expected to fail is still just an attempt.
  const runTolerantly = () => run().catch(() => undefined);

  const apply = async (step: Step) => {
    switch (step) {
      case 'succeeds':
        await run();
        break;
      case 'created-then-no-answer':
        fake.failNextCreates.push('created-then-unknown');
        await runTolerantly();
        break;
      case 'created-then-save-fails':
        failNextSave = true;
        await runTolerantly();
        failNextSave = false;
        break;
      case 'rejected':
        fake.failNextCreates.push('rejected');
        await runTolerantly();
        break;
      case 'never-sent':
        fake.failNextCreates.push('not-sent');
        await runTolerantly();
        break;
      case 'worker-dies': {
        // What a dead worker leaves behind: an export row stuck PROCESSING
        // (old enough to be resumed) and, at the provider, the invoice that
        // attempt created. Like any attempt it would not have started for an
        // order already exported, and would have looked the invoice up first.
        const connection = await activeConnection();
        const done = await prisma.accountingInvoiceExport.findFirst({
          where: { orderId: order.id, status: AccountingInvoiceExportStatus.COMPLETED },
        });
        if (done) break;
        const stuck = {
          status: AccountingInvoiceExportStatus.PROCESSING,
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        };
        await prisma.accountingInvoiceExport.upsert({
          where: { accountingOrganisationId_orderId: { accountingOrganisationId: connection.accountingOrganisationId, orderId: order.id } },
          create: { distributorId: DIST, accountingOrganisationId: connection.accountingOrganisationId, provider: connection.provider, orderId: order.id, retryCount: 1, ...stuck },
          update: stuck,
        });
        if (fake.liveInvoices(order.orderNumber).length === 0) {
          await fake.createInvoice(FakeAccountingAdapter.tokenSet(), 'fake-org-1', {
            externalContactId: 'fake-contact',
            reference: order.orderNumber,
            currency: 'GBP',
            issueDate: '2026-10-02',
            targetStatus: 'DRAFT',
            lines: [{ description: 'House Red', quantity: 6, unitPrice: '10.00' }],
          }, `dead-worker-${Math.random()}`);
        }
        break;
      }
      case 'record-lost': {
        const exports = await prisma.accountingInvoiceExport.findMany({ where: { orderId: order.id }, select: { id: true } });
        await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: exports.map((e) => e.id) } } });
        await prisma.accountingInvoiceExport.deleteMany({ where: { orderId: order.id } });
        break;
      }
      case 'reconnected':
        await prisma.accountingConnection.updateMany({
          where: { distributorId: DIST, status: AccountingConnectionStatus.CONNECTED },
          data: { status: AccountingConnectionStatus.DISCONNECTED, disconnectedAt: new Date() },
        });
        await connect();
        break;
    }
    // Time passes: the provider no longer remembers any idempotency key.
    fake.expireIdempotencyKeys();
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = module.get(PrismaService);
    const get = <T>(token: new (...args: never[]) => T) => module.get(token, { strict: false });

    fake = new FakeAccountingAdapter();
    const registry = { get: () => fake, displayName: () => fake.displayName } as unknown as AccountingAdapterRegistry;
    // The real outbox, except that a test can make the save of a completed
    // export fail — the "provider created it, we could not record it" case.
    const realOutbox = get(OutboxService);
    const outbox = {
      writeEvent: (...args: Parameters<OutboxService['writeEvent']>) => {
        if (failNextSave && args[3] === 'AccountingInvoiceExportProcessed') {
          throw new Error('database unavailable (test)');
        }
        return realOutbox.writeEvent(...args);
      },
    } as unknown as OutboxService;
    invoiceExport = new AccountingInvoiceExportProcessor(
      prisma, get(AccountingConnectionService), get(AccountingTaxTypeService), registry, outbox, get(AuditService), get(AdminNotificationsService),
    );

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'No-Duplicates Test Distributor', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER },
      create: { id: CUSTOMER, name: 'The Old Hall', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER },
      create: { id: USER, email: 'nodup@integration.test', keycloakId: 'kc-nodup', firstName: 'N', lastName: 'D' },
      update: {},
    });
    await cleanup();

    tradeRelationship = await prisma.tradeRelationship.create({ data: { distributorId: DIST, customerId: CUSTOMER } });
    const product = await prisma.product.create({ data: { distributorId: DIST, name: 'House Red', sku: `ND-${Date.now()}` } });
    const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    order = await prisma.order.create({
      data: {
        distributorId: DIST,
        traderCustomerId: CUSTOMER,
        placedByUserId: USER,
        orderNumber: `TEST-ND-${nextval}`,
        currency: 'GBP',
        status: OrderStatus.ACCEPTED,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('60.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('60.00'),
        acceptedAt: new Date(),
      },
    });
    await prisma.orderLine.create({
      data: {
        orderId: order.id,
        distributorId: DIST,
        traderCustomerId: CUSTOMER,
        productId: product.id,
        productNameSnapshot: product.name,
        quantityOrdered: 6,
        unitPriceSnapshot: new Prisma.Decimal('10.00'),
        subtotalAmount: new Prisma.Decimal('60.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('60.00'),
        status: OrderLineStatus.ACCEPTED,
      },
    });
  });

  afterAll(async () => {
    try {
      await cleanup();
      await prisma.user.deleteMany({ where: { id: USER } });
      await prisma.organisation.deleteMany({ where: { id: { in: [DIST, CUSTOMER] } } });
    } finally {
      await module.close();
    }
  });

  it.each(STEPS)(
    'holds at most one invoice through every sequence of failures that starts with "%s"',
    async (first) => {
      const broken: string[] = [];
      for (const schedule of schedulesStartingWith(first)) {
        const name = schedule.join(' → ');
        await reset();

        for (const step of schedule) {
          await apply(step);
          const live = fake.liveInvoices(order.orderNumber).length;
          if (live > 1) broken.push(`${name}: ${live} invoices at the provider after "${step}"`);
        }

        // Things settle down: the export is retried with nothing going wrong.
        await run();
        await run();
        const invoices = fake.liveInvoices(order.orderNumber);
        const completed = await prisma.accountingInvoiceExport.findMany({
          where: { orderId: order.id, status: AccountingInvoiceExportStatus.COMPLETED },
        });
        if (invoices.length !== 1) {
          broken.push(`${name}: ended with ${invoices.length} invoices at the provider`);
        } else if (completed.length !== 1 || completed[0].externalInvoiceId !== invoices[0].externalInvoiceId) {
          broken.push(`${name}: the export does not point at the provider's invoice ${invoices[0].externalInvoiceId}`);
        }
      }
      expect(broken).toEqual([]);
    },
    10 * 60 * 1000,
  );
});
