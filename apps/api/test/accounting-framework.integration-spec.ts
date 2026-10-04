/**
 * The accounting integration framework, end to end, through a provider that
 * is not Xero (test/support/fake-accounting.adapter.ts): contact sync →
 * (user links the customer) → invoice export → payment in the provider →
 * invoice status sync → order timeline + order COMPLETED.
 *
 * If this needs changing to support a new provider, the port is leaking.
 * Limit: the fake is handed to the processors in place of the registry's
 * adapter, and the connection row still says XERO (AccountingProvider is a
 * database enum with one value today) — so this proves the logic above the
 * port, not provider identity. Provider identity is covered by
 * src/accounting/accounting-framework.arch.spec.ts.
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccountingConnectionStatus,
  AccountingContactMatchMethod,
  AccountingInvoiceExportStatus,
  AccountingProvider,
  IngestionRunStatus,
  OrderLineStatus,
  OrderStatus,
  OrganisationType,
  Prisma,
} from '@prisma/client';
import { Job } from 'bullmq';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccountingConnectionService } from '../src/accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../src/accounting/adapters/accounting-adapter.registry';
import { AccountingChangeDetectionService } from '../src/accounting/accounting-change-detection.service';
import { AccountingContactMatcherService } from '../src/accounting/matching/accounting-contact-matcher.service';
import { AccountingTaxTypeService } from '../src/accounting/accounting-tax-type.service';
import { InvoicePaymentStateService } from '../src/accounting/invoice-payment-state.service';
import { TokenEncryptionService } from '../src/accounting/token-encryption.service';
import { IngestionRunService } from '../src/ingestion/ingestion-run.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { AuditService } from '../src/audit/audit.service';
import { AdminNotificationsService } from '../src/admin-notifications/admin-notifications.service';
import { AccountingContactSyncProcessor } from '../src/accounting-contact-sync/accounting-contact-sync.processor';
import { AccountingInvoiceExportProcessor } from '../src/accounting-invoice-export/accounting-invoice-export.processor';
import { AccountingInvoiceSyncProcessor } from '../src/accounting-invoice-sync/accounting-invoice-sync.processor';
import { FakeAccountingAdapter } from './support/fake-accounting.adapter';
import { createAccountingConnection } from './support/accounting-fixtures';

const DIST = 'test-framework-dist';
const CUSTOMER = 'test-framework-customer';
const USER = 'test-framework-user';

const job = (data: Record<string, unknown>) =>
  ({ id: 'job-1', name: 'test', data: { eventId: `evt-${Math.random()}`, aggregateType: 'x', ...data }, attemptsMade: 0, opts: { attempts: 3 } }) as unknown as Job;

describe('Accounting integration framework, through a non-Xero provider (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let fake: FakeAccountingAdapter;
  let contactSync: AccountingContactSyncProcessor;
  let invoiceExport: AccountingInvoiceExportProcessor;
  let invoiceSync: AccountingInvoiceSyncProcessor;

  const cleanup = async () => {
    const orders = await prisma.order.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const exports = await prisma.accountingInvoiceExport.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const connections = await prisma.accountingConnection.findMany({ where: { distributorId: DIST }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...orders, ...exports, ...connections].map((r) => r.id) } },
    });
    await prisma.auditLog.deleteMany({ where: { distributorId: DIST } });
    await prisma.adminNotification.deleteMany({ where: { organisationId: DIST } });
    await prisma.ingestionRun.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingInvoiceExport.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingContactMatchSuggestion.deleteMany({ where: { distributorId: DIST } });
    await prisma.customerAccountingMapping.deleteMany({ where: { distributorId: DIST } });
    await prisma.externalAccountingContact.deleteMany({ where: { distributorId: DIST } });
    await prisma.orderLine.deleteMany({ where: { distributorId: DIST } });
    await prisma.order.deleteMany({ where: { distributorId: DIST } });
    await prisma.product.deleteMany({ where: { distributorId: DIST } });
    await prisma.tradeRelationship.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: DIST } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: DIST } });
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = module.get(PrismaService);
    const get = <T>(token: new (...args: never[]) => T) => module.get(token, { strict: false });

    // The processors, built with the app's real services — only the adapter
    // registry is swapped, so every provider call goes to the fake.
    fake = new FakeAccountingAdapter();
    const registry = { get: () => fake, displayName: () => fake.displayName } as unknown as AccountingAdapterRegistry;
    const connections = get(AccountingConnectionService);
    const runs = get(IngestionRunService);
    contactSync = new AccountingContactSyncProcessor(
      prisma, connections, registry, get(AccountingChangeDetectionService), runs, get(AccountingContactMatcherService),
    );
    invoiceExport = new AccountingInvoiceExportProcessor(
      prisma, connections, get(AccountingTaxTypeService), registry, get(OutboxService), get(AuditService), get(AdminNotificationsService),
    );
    invoiceSync = new AccountingInvoiceSyncProcessor(prisma, connections, registry, runs, get(InvoicePaymentStateService));

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'Framework Test Distributor', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: CUSTOMER },
      create: { id: CUSTOMER, name: 'The Old Hall', type: OrganisationType.TRADE_CUSTOMER },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER },
      create: { id: USER, email: 'framework@integration.test', keycloakId: 'kc-framework', firstName: 'F', lastName: 'W' },
      update: {},
    });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, CUSTOMER] } } });
    await module.close();
  });

  it('syncs contacts, exports an invoice, and follows its payment through to a completed order', async () => {
    const tradeRelationship = await prisma.tradeRelationship.create({ data: { distributorId: DIST, customerId: CUSTOMER } });
    const connection = await createAccountingConnection(prisma, {
        distributorId: DIST,
        provider: AccountingProvider.XERO, // the only enum value today — see the header
        status: AccountingConnectionStatus.CONNECTED,
        externalOrganisationId: 'fake-org-1',
        externalOrganisationName: 'Fake Books Organisation',
        scopes: 'fake.all',
        encryptedCredentialData: module.get(TokenEncryptionService, { strict: false }).encrypt(JSON.stringify(FakeAccountingAdapter.tokenSet())),
        connectedByUserId: USER,
        connectedAt: new Date(),
      });

    // 1. Contact sync pulls the provider's contacts into the cache.
    fake.contacts = [
      { externalId: 'fake-contact-1', displayName: 'The Old Hall', isCustomer: true, isSupplier: false, isArchived: false, raw: {} },
    ];
    await contactSync.process(job({ aggregateId: connection.id, payload: {} }));

    const cached = await prisma.externalAccountingContact.findFirstOrThrow({ where: { accountingOrganisationId: connection.accountingOrganisationId } });
    expect(cached).toMatchObject({ externalContactId: 'fake-contact-1', displayName: 'The Old Hall' });
    expect(await prisma.ingestionRun.findFirstOrThrow({ where: { sourceRef: connection.id, resourceType: 'contact' } })).toMatchObject({
      status: IngestionRunStatus.COMPLETED,
      recordsProcessed: 1,
    });

    // 2. The distributor links the customer to that contact (a user action).
    await prisma.customerAccountingMapping.create({
      data: {
        distributorId: DIST,
        accountingOrganisationId: connection.accountingOrganisationId,
        tradeRelationshipId: tradeRelationship.id,
        externalContactId: cached.id,
        matchMethod: AccountingContactMatchMethod.MANUAL,
        linkedByUserId: USER,
      },
    });

    // 3. An accepted order is exported as an invoice — at Stocdup's price.
    const product = await prisma.product.create({ data: { distributorId: DIST, name: 'House Red', sku: `FW-${Date.now()}` } });
    const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const order = await prisma.order.create({
      data: {
        distributorId: DIST,
        traderCustomerId: CUSTOMER,
        placedByUserId: USER,
        orderNumber: `TEST-FW-${nextval}`,
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

    await invoiceExport.process(job({ aggregateId: order.id, payload: { orderId: order.id, distributorId: DIST } }));

    expect(fake.createdInvoices).toHaveLength(1);
    expect(fake.createdInvoices[0].request).toMatchObject({
      externalContactId: 'fake-contact-1',
      reference: order.orderNumber,
      currency: 'GBP',
      lines: [expect.objectContaining({ quantity: 6, unitPrice: '10.00' })],
    });
    const exported = await prisma.accountingInvoiceExport.findFirstOrThrow({ where: { orderId: order.id } });
    expect(exported).toMatchObject({ status: AccountingInvoiceExportStatus.COMPLETED, externalInvoiceId: 'fake-inv-1', externalInvoiceNumber: 'FB-0001' });

    // 4. The order is delivered, then the customer pays in the provider; the
    //    invoice status sync follows the payment.
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.DELIVERED } });
    fake.recordPayment('fake-inv-1', 60);
    await invoiceSync.process(job({ aggregateId: connection.id, payload: {} }));

    expect(await prisma.accountingInvoiceExport.findUniqueOrThrow({ where: { id: exported.id } })).toMatchObject({ invoiceState: 'PAID' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.COMPLETED);

    // The order timeline tells the story, naming the provider by its display name.
    const timeline = await prisma.auditLog.findMany({ where: { entityType: 'ORDER', entityId: order.id } });
    expect(timeline.map((e) => e.summary)).toEqual(
      expect.arrayContaining([
        'Invoice FB-0001 raised in Fake Books',
        'Invoice FB-0001 marked paid in Fake Books',
        'Order completed — delivered and paid',
      ]),
    );
  });
});
