/**
 * Integration tests for the invoice status sync (ADR-072): against a real
 * database, a sync for one distributor's connection updates only that
 * distributor's invoice exports — even when two distributors' accounting
 * systems happen to use the same external invoice id — and a payment status
 * change is written together with its outbox event, an audit row on the
 * order's timeline, and the order's completion (delivered + paid → COMPLETED).
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { Test } from '@nestjs/testing';
import {
  AccountingConnectionStatus,
  AccountingInvoiceExportStatus,
  AccountingProvider,
  OrderStatus,
  OrganisationType,
  Prisma,
} from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { IngestionRunService } from '../src/ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../src/accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../src/accounting/adapters/accounting-adapter.registry';
import { AccountingExternalInvoiceStatus } from '../src/accounting/adapters/accounting-connection-adapter.interface';
import { AccountingInvoiceSyncProcessor } from '../src/accounting-invoice-sync/accounting-invoice-sync.processor';
import { INVOICE_PAYMENT_STATUS_CHANGED } from '../src/accounting/invoice-payment-status';
import { InvoicePaymentStateService } from '../src/accounting/invoice-payment-state.service';
import { AuditService } from '../src/audit/audit.service';
import { OrderCompletionService } from '../src/orders/order-completion.service';
import { createAccountingConnection } from './support/accounting-fixtures';

const DIST_A = 'test-invsync-dist-a';
const DIST_B = 'test-invsync-dist-b';
const USER = 'test-invsync-user';

describe('Invoice status sync (integration)', () => {
  let prisma: PrismaService;
  let processor: AccountingInvoiceSyncProcessor;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = module.get(PrismaService);
    close = () => module.close();
    processor = new AccountingInvoiceSyncProcessor(
      prisma,
      {} as AccountingConnectionService,
      { displayName: () => 'Xero' } as unknown as AccountingAdapterRegistry,
      {} as IngestionRunService,
      new InvoicePaymentStateService(
        new AuditService(),
        new OutboxService(),
        new OrderCompletionService(new AuditService(), new OutboxService()),
      ),
    );
    for (const id of [DIST_A, DIST_B]) {
      await prisma.organisation.upsert({
        where: { id },
        create: { id, name: `Invoice Sync Test ${id}`, type: OrganisationType.DISTRIBUTOR },
        update: {},
      });
    }
    await prisma.user.upsert({
      where: { id: USER },
      create: { id: USER, email: 'invsync@integration.test', keycloakId: 'kc-invsync', firstName: 'I', lastName: 'S' },
      update: {},
    });
  });

  const cleanup = async () => {
    const exports = await prisma.accountingInvoiceExport.findMany({
      where: { distributorId: { in: [DIST_A, DIST_B] } },
      select: { id: true },
    });
    const orders = await prisma.order.findMany({ where: { distributorId: { in: [DIST_A, DIST_B] } }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...exports.map((e) => e.id), ...orders.map((o) => o.id)] } },
    });
    await prisma.auditLog.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.order.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: { in: [DIST_A, DIST_B] } } });
  };

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST_A, DIST_B] } } });
    await close();
  });

  async function exportedInvoice(distributorId: string, externalInvoiceId: string, status: OrderStatus = OrderStatus.ACCEPTED) {
    const connection = await createAccountingConnection(prisma, {
        distributorId,
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId: `tenant-${distributorId}`,
        externalOrganisationName: 'Org',
        scopes: 'openid accounting.invoices',
        encryptedCredentialData: 'irrelevant',
        connectedByUserId: USER,
        connectedAt: new Date(),
      });
    const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const order = await prisma.order.create({
      data: {
        distributorId,
        traderCustomerId: distributorId,
        placedByUserId: USER,
        orderNumber: `TEST-INVSYNC-${nextval}`,
        currency: 'GBP',
        status,
        acceptanceModeSnapshot: 'MANUAL',
        acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
        subtotalAmount: new Prisma.Decimal('100.00'),
        taxAmount: new Prisma.Decimal('20.00'),
        totalAmount: new Prisma.Decimal('120.00'),
        acceptedAt: new Date(),
      },
    });
    const exp = await prisma.accountingInvoiceExport.create({
      data: {
        distributorId,
        accountingOrganisationId: connection.accountingOrganisationId,
        provider: AccountingProvider.XERO,
        orderId: order.id,
        status: AccountingInvoiceExportStatus.COMPLETED,
        externalInvoiceId,
        exportedAt: new Date(),
      },
    });
    return { connection, order, exp };
  }

  const paid = (externalInvoiceId: string): AccountingExternalInvoiceStatus => ({
    externalInvoiceId,
    externalInvoiceNumber: 'INV-1',
    state: 'PAID',
    rawStatus: 'PAID',
    currency: 'GBP',
    total: '120',
    amountPaid: '120',
    amountCredited: '0',
    amountDue: '0',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    fullyPaidOn: '2026-09-20',
    providerUpdatedAt: new Date('2026-09-20T09:00:00Z'),
  });

  it("updates only the syncing connection's invoice, even when another distributor's has the same external id", async () => {
    const a = await exportedInvoice(DIST_A, 'shared-inv-id');
    const b = await exportedInvoice(DIST_B, 'shared-inv-id');

    const result = await processor.applyStatuses(a.connection, [paid('shared-inv-id')]);

    expect(result).toEqual({ matched: 1, updated: 1, statusChanges: 1 });
    const afterA = await prisma.accountingInvoiceExport.findUniqueOrThrow({ where: { id: a.exp.id } });
    const afterB = await prisma.accountingInvoiceExport.findUniqueOrThrow({ where: { id: b.exp.id } });
    expect(afterA.invoiceState).toBe('PAID');
    expect(afterA.amountDue?.toFixed(2)).toBe('0.00');
    expect(afterA.fullyPaidOn?.toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(afterB.invoiceState).toBeNull();
  });

  it('writes the payment status change and its outbox event together', async () => {
    const a = await exportedInvoice(DIST_A, 'inv-a');

    await processor.applyStatuses(a.connection, [paid('inv-a')]);

    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: a.exp.id } });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe(INVOICE_PAYMENT_STATUS_CHANGED);
    expect(events[0].payload).toMatchObject({
      distributorId: DIST_A,
      orderId: a.order.id,
      fromStatus: 'NOT_SYNCED',
      toStatus: 'PAID',
    });
  });

  it('is idempotent — re-applying the same snapshot changes nothing and emits nothing', async () => {
    const a = await exportedInvoice(DIST_A, 'inv-a');

    await processor.applyStatuses(a.connection, [paid('inv-a')]);
    const second = await processor.applyStatuses(a.connection, [paid('inv-a')]);

    expect(second).toEqual({ matched: 1, updated: 0, statusChanges: 0 });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: a.exp.id } })).toBe(1);
  });

  const unpaid = (externalInvoiceId: string): AccountingExternalInvoiceStatus => ({
    ...paid(externalInvoiceId),
    state: 'AWAITING_PAYMENT',
    rawStatus: 'AUTHORISED',
    amountPaid: '0',
    amountDue: '120',
    fullyPaidOn: null,
    providerUpdatedAt: new Date('2026-09-21T09:00:00Z'),
  });

  const timeline = (orderId: string) => prisma.auditLog.findMany({ where: { entityType: 'ORDER', entityId: orderId } });
  // Rows written in one transaction share a createdAt, so compare as a sorted list.
  const actions = async (orderId: string) => (await timeline(orderId)).map((e) => e.action).sort();

  it("records the payment on the order's timeline", async () => {
    const a = await exportedInvoice(DIST_A, 'inv-a');

    await processor.applyStatuses(a.connection, [paid('inv-a')]);

    const entries = await timeline(a.order.id);
    expect(entries).toEqual([
      expect.objectContaining({
        distributorId: DIST_A,
        action: 'INVOICE_PAYMENT_STATUS_CHANGED',
        actorType: 'SYSTEM',
        summary: 'Invoice INV-1 marked paid in Xero',
      }),
    ]);
  });

  it('leaves an undelivered order ACCEPTED when its invoice is paid', async () => {
    const a = await exportedInvoice(DIST_A, 'inv-a');

    await processor.applyStatuses(a.connection, [paid('inv-a')]);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe(OrderStatus.ACCEPTED);
  });

  it('completes a delivered order when its invoice is paid, and reopens it if the payment is reversed', async () => {
    const a = await exportedInvoice(DIST_A, 'inv-a', OrderStatus.DELIVERED);

    await processor.applyStatuses(a.connection, [paid('inv-a')]);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe(OrderStatus.COMPLETED);
    expect(await actions(a.order.id)).toEqual(['INVOICE_PAYMENT_STATUS_CHANGED', 'ORDER_COMPLETED']);
    const completed = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: a.order.id, eventType: 'OrderCompleted' } });
    expect(completed.payload).toMatchObject({ orderId: a.order.id, distributorId: DIST_A, status: OrderStatus.COMPLETED });

    await processor.applyStatuses(a.connection, [unpaid('inv-a')]);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe(OrderStatus.DELIVERED);
    expect(await actions(a.order.id)).toEqual([
      'INVOICE_PAYMENT_STATUS_CHANGED',
      'INVOICE_PAYMENT_STATUS_CHANGED',
      'ORDER_COMPLETED',
      'ORDER_COMPLETION_REVERSED',
    ]);
    const reopened = (await timeline(a.order.id)).find((e) => e.action === 'ORDER_COMPLETION_REVERSED');
    expect(reopened?.summary).toBe('Order reopened — invoice INV-1 is no longer paid');
  });

  it("does not complete another distributor's order sharing the external invoice id", async () => {
    const a = await exportedInvoice(DIST_A, 'shared-inv-id', OrderStatus.DELIVERED);
    const b = await exportedInvoice(DIST_B, 'shared-inv-id', OrderStatus.DELIVERED);

    await processor.applyStatuses(a.connection, [paid('shared-inv-id')]);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe(OrderStatus.COMPLETED);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: b.order.id } })).status).toBe(OrderStatus.DELIVERED);
    expect(await timeline(b.order.id)).toHaveLength(0);
  });

  async function reconnect(distributorId: string, externalOrganisationId: string) {
    await prisma.accountingConnection.updateMany({
      where: { distributorId, status: AccountingConnectionStatus.CONNECTED },
      data: { status: AccountingConnectionStatus.DISCONNECTED, disconnectedAt: new Date() },
    });
    return createAccountingConnection(prisma, {
        distributorId,
        provider: AccountingProvider.XERO,
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId,
        externalOrganisationName: 'Org',
        scopes: 'openid accounting.invoices',
        encryptedCredentialData: 'irrelevant',
        connectedByUserId: USER,
        connectedAt: new Date(),
      });
  }

  it('after a reconnect to the same organisation, still updates invoices exported before it', async () => {
    const a = await exportedInvoice(DIST_A, 'inv-before-reconnect');
    const newConnection = await reconnect(DIST_A, a.connection.organisation.externalOrganisationId);

    const result = await processor.applyStatuses(newConnection, [paid('inv-before-reconnect')]);

    expect(result).toEqual({ matched: 1, updated: 1, statusChanges: 1 });
    const after = await prisma.accountingInvoiceExport.findUniqueOrThrow({ where: { id: a.exp.id } });
    expect(after.invoiceState).toBe('PAID');
    expect(newConnection.accountingOrganisationId).toBe(a.connection.accountingOrganisationId);
  });

  it('after a reconnect to a different organisation, leaves the old organisation\'s invoices alone', async () => {
    const a = await exportedInvoice(DIST_A, 'inv-old-org');
    const newConnection = await reconnect(DIST_A, 'a-different-org');

    const result = await processor.applyStatuses(newConnection, [paid('inv-old-org')]);

    expect(result).toEqual({ matched: 0, updated: 0, statusChanges: 0 });
    expect((await prisma.accountingInvoiceExport.findUniqueOrThrow({ where: { id: a.exp.id } })).invoiceState).toBeNull();
  });
});
