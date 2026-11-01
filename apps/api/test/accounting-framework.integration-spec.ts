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
  IngestionRunTrigger,
  OrderLineStatus,
  OrderStatus,
  OrganisationType,
  Prisma,
  Role,
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
import { AccountingAccountSyncProcessor } from '../src/accounting-account-sync/accounting-account-sync.processor';
import { AccountingAccountService } from '../src/accounting/accounting-account.service';
import { FakeAccountingAdapter } from './support/fake-accounting.adapter';
import { createAccountingConnection } from './support/accounting-fixtures';
import { ACCOUNTING_SOURCE_TYPE } from '../src/accounting/sync/accounting-sync.constants';

const DIST = 'test-framework-dist';
const CUSTOMER = 'test-framework-customer';
const USER = 'test-framework-user';
const OTHER_DIST = 'test-framework-dist-other';

const job = (data: Record<string, unknown>) =>
  ({ id: 'job-1', name: 'test', data: { eventId: `evt-${Math.random()}`, aggregateType: 'x', ...data }, attemptsMade: 0, opts: { attempts: 3 } }) as unknown as Job;

describe('Accounting integration framework, through a non-Xero provider (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let fake: FakeAccountingAdapter;
  let contactSync: AccountingContactSyncProcessor;
  let invoiceExport: AccountingInvoiceExportProcessor;
  let invoiceSync: AccountingInvoiceSyncProcessor;
  let accountSync: AccountingAccountSyncProcessor;
  let connectionService: AccountingConnectionService;
  let accountService: AccountingAccountService;
  let runs: IngestionRunService;

  const cleanup = async () => {
    const orders = await prisma.order.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const exports = await prisma.accountingInvoiceExport.findMany({ where: { distributorId: DIST }, select: { id: true } });
    const connections = await prisma.accountingConnection.findMany({ where: { distributorId: DIST }, select: { id: true } });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...orders, ...exports, ...connections].map((r) => r.id) } },
    });
    await prisma.auditLog.deleteMany({ where: { distributorId: DIST } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organisationId: DIST } } });
    await prisma.membership.deleteMany({ where: { organisationId: DIST } });
    await prisma.ingestionRun.deleteMany({ where: { distributorId: OTHER_DIST } });
    await prisma.externalAccountingAccount.deleteMany({ where: { distributorId: OTHER_DIST } });
    await prisma.accountingConnection.deleteMany({ where: { distributorId: OTHER_DIST } });
    await prisma.accountingOrganisation.deleteMany({ where: { distributorId: OTHER_DIST } });
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
    await prisma.externalAccountingAccount.deleteMany({ where: { distributorId: DIST } });
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
    runs = get(IngestionRunService);
    contactSync = new AccountingContactSyncProcessor(
      prisma, connections, registry, get(AccountingChangeDetectionService), runs, get(AccountingContactMatcherService),
    );
    invoiceExport = new AccountingInvoiceExportProcessor(
      prisma, connections, get(AccountingTaxTypeService), registry, get(OutboxService), get(AuditService), get(AdminNotificationsService),
    );
    invoiceSync = new AccountingInvoiceSyncProcessor(prisma, connections, registry, runs, get(InvoicePaymentStateService));
    accountSync = new AccountingAccountSyncProcessor(prisma, connections, registry, runs, get(AdminNotificationsService));
    connectionService = connections;
    accountService = get(AccountingAccountService);

    await prisma.organisation.upsert({
      where: { id: DIST },
      create: { id: DIST, name: 'Framework Test Distributor', type: OrganisationType.DISTRIBUTOR },
      update: {},
    });
    await prisma.organisation.upsert({
      where: { id: OTHER_DIST },
      create: { id: OTHER_DIST, name: 'Framework Test Other Distributor', type: OrganisationType.DISTRIBUTOR },
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
    await prisma.organisation.deleteMany({ where: { id: { in: [DIST, OTHER_DIST, CUSTOMER] } } });
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
        // Frozen at acceptance from the customer's payment terms (ADR-075).
        invoiceDate: new Date('2026-10-04T00:00:00Z'),
        dueDate: new Date('2026-11-03T00:00:00Z'),
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
      issueDate: '2026-10-04',
      dueDate: '2026-11-03',
      lines: [expect.objectContaining({ quantity: 6, unitPrice: '10.00' })],
    });
    const exported = await prisma.accountingInvoiceExport.findFirstOrThrow({ where: { orderId: order.id } });
    expect(exported).toMatchObject({
      status: AccountingInvoiceExportStatus.COMPLETED,
      externalInvoiceId: 'fake-inv-1',
      externalInvoiceNumber: 'FB-0001',
      requestedDueDate: new Date('2026-11-03T00:00:00Z'),
    });

    // 4. The order is delivered, then the customer pays in the provider; the
    //    invoice status sync follows the payment.
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.DELIVERED } });
    fake.recordPayment('fake-inv-1', 60);
    await invoiceSync.process(job({ aggregateId: connection.id, payload: {} }));

    // The provider's own due date comes back (the provider honoured ours).
    expect(await prisma.accountingInvoiceExport.findUniqueOrThrow({ where: { id: exported.id } })).toMatchObject({
      invoiceState: 'PAID',
      dueDate: new Date('2026-11-03T00:00:00Z'),
    });
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

  it('posts lines without an account of their own to the default sales account, at the code the last account sync saw', async () => {
    await cleanup(); // the first test leaves its trade relationship and connection behind
    const tradeRelationship = await prisma.tradeRelationship.create({ data: { distributorId: DIST, customerId: CUSTOMER } });
    const connection = await createAccountingConnection(prisma, {
      distributorId: DIST,
      provider: AccountingProvider.XERO,
      status: AccountingConnectionStatus.CONNECTED,
      externalOrganisationId: 'fake-org-1',
      externalOrganisationName: 'Fake Books Organisation',
      scopes: 'fake.all',
      encryptedCredentialData: module.get(TokenEncryptionService, { strict: false }).encrypt(JSON.stringify(FakeAccountingAdapter.tokenSet())),
      connectedByUserId: USER,
      connectedAt: new Date(),
    });
    const contact = await prisma.externalAccountingContact.create({
      data: {
        distributorId: DIST,
        accountingOrganisationId: connection.accountingOrganisationId,
        provider: AccountingProvider.XERO,
        externalContactId: 'fake-contact-2',
        displayName: 'The Old Hall',
        isCustomer: true,
        isSupplier: false,
        isArchived: false,
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

    // The account sync caches the provider's sales accounts; the distributor
    // picks the default from that cache. An archived account can't be chosen.
    fake.salesAccounts = [
      { externalId: 'fake-acc-400', code: '400', displayName: 'Wholesale Sales', isActive: true, raw: {} },
      { externalId: 'fake-acc-410', code: '410', displayName: 'Other Income', isActive: true, raw: {} },
      { externalId: 'fake-acc-420', code: '420', displayName: 'Old Sales', isActive: false, raw: {} },
    ];
    await accountSync.process(job({ aggregateId: connection.id, payload: {} }));
    const listed = await accountService.listSalesAccounts(DIST);
    expect(listed.map((a) => a.code)).toEqual(['400', '410']);
    const archived = await prisma.externalAccountingAccount.findFirstOrThrow({ where: { distributorId: DIST, code: '420' } });
    await expect(
      connectionService.updateConnectionSettings(DIST, { invoiceDefaultAccountId: archived.id }, USER),
    ).rejects.toThrow(/not an active sales account/);
    const chosen = listed.find((a) => a.code === '400')!;
    const status = await connectionService.updateConnectionSettings(DIST, { invoiceDefaultAccountId: chosen.id }, USER);
    expect(status.invoiceDefaultAccount).toMatchObject({ id: chosen.id, code: '400', displayName: 'Wholesale Sales' });

    // The account is recoded in the provider; the next sync (requested the way
    // the scheduler and manual Sync do) updates the cache, and the export
    // sends the new code.
    fake.salesAccounts[0] = { ...fake.salesAccounts[0], code: '4000' };
    const { run } = await prisma.$transaction((tx) =>
      runs.requestRun(tx, {
        distributorId: DIST,
        sourceType: ACCOUNTING_SOURCE_TYPE,
        sourceRef: connection.id,
        resourceType: 'account',
        trigger: IngestionRunTrigger.MANUAL,
      }),
    );
    await accountSync.process(job({ aggregateId: connection.id, payload: { runId: run.id } }));

    // An order with an unlinked product is exported: its line carries the default.
    const product = await prisma.product.create({ data: { distributorId: DIST, name: 'House White', sku: `FW-${Date.now()}` } });
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
        subtotalAmount: new Prisma.Decimal('20.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('20.00'),
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
        quantityOrdered: 2,
        unitPriceSnapshot: new Prisma.Decimal('10.00'),
        subtotalAmount: new Prisma.Decimal('20.00'),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('20.00'),
        status: OrderLineStatus.ACCEPTED,
      },
    });

    const before = fake.createdInvoices.length;
    await invoiceExport.process(job({ aggregateId: order.id, payload: { orderId: order.id, distributorId: DIST } }));

    expect(fake.createdInvoices).toHaveLength(before + 1);
    expect(fake.createdInvoices[before].request.lines).toEqual([expect.objectContaining({ accountCode: '4000' })]);
  });

  const connectTo = (distributorId: string, externalOrganisationId: string) =>
    createAccountingConnection(prisma, {
      distributorId,
      provider: AccountingProvider.XERO,
      status: AccountingConnectionStatus.CONNECTED,
      externalOrganisationId,
      externalOrganisationName: 'Fake Books Organisation',
      scopes: 'fake.all',
      encryptedCredentialData: module.get(TokenEncryptionService, { strict: false }).encrypt(JSON.stringify(FakeAccountingAdapter.tokenSet())),
      connectedByUserId: USER,
      connectedAt: new Date(),
    });

  it("never lists or accepts another distributor's sales account", async () => {
    await cleanup();
    await connectTo(DIST, 'fake-org-1');
    const other = await connectTo(OTHER_DIST, 'fake-org-other');
    fake.salesAccounts = [{ externalId: 'fake-acc-other', code: '900', displayName: 'Their Sales', isActive: true, raw: {} }];
    await accountSync.process(job({ aggregateId: other.id, payload: {} }));
    const theirAccount = await prisma.externalAccountingAccount.findFirstOrThrow({ where: { distributorId: OTHER_DIST } });

    expect(await accountService.listSalesAccounts(DIST)).toEqual([]);
    await expect(
      connectionService.updateConnectionSettings(DIST, { invoiceDefaultAccountId: theirAccount.id }, USER),
    ).rejects.toThrow(/not an active sales account/);
    expect((await connectionService.getConnectionStatus(DIST))?.invoiceDefaultAccount).toBeNull();
  });

  it('still tells the admins the default account went inactive when the first attempt fails part-way', async () => {
    await cleanup();
    const connection = await connectTo(DIST, 'fake-org-1');
    await prisma.membership.create({
      data: { userId: USER, organisationId: DIST, role: Role.DISTRIBUTOR_ADMIN, roles: { create: { role: Role.DISTRIBUTOR_ADMIN } } },
    });
    fake.salesAccounts = [{ externalId: 'fake-acc-400', code: '400', displayName: 'Wholesale Sales', isActive: true, raw: {} }];
    await accountSync.process(job({ aggregateId: connection.id, payload: {} }));
    const [chosen] = await accountService.listSalesAccounts(DIST);
    await connectionService.updateConnectionSettings(DIST, { invoiceDefaultAccountId: chosen.id }, USER);

    fake.salesAccounts = [{ ...fake.salesAccounts[0], isActive: false }];
    const { run } = await prisma.$transaction((tx) =>
      runs.requestRun(tx, {
        distributorId: DIST,
        sourceType: ACCOUNTING_SOURCE_TYPE,
        sourceRef: connection.id,
        resourceType: 'account',
        trigger: IngestionRunTrigger.MANUAL,
      }),
    );
    const syncJob = job({ aggregateId: connection.id, payload: { runId: run.id } });

    const notifications = module.get(AdminNotificationsService, { strict: false });
    const failOnce = jest.spyOn(notifications, 'notifyOrganisationAdmins').mockRejectedValueOnce(new Error('database went away'));
    await expect(accountSync.process(syncJob)).rejects.toThrow('database went away');
    failOnce.mockRestore();

    // Rolled back, so the retry can still see the change.
    expect(await prisma.externalAccountingAccount.findUniqueOrThrow({ where: { id: chosen.id } })).toMatchObject({ isActive: true });
    expect(await prisma.adminNotification.count({ where: { organisationId: DIST } })).toBe(0);

    await accountSync.process(syncJob);

    expect(await prisma.externalAccountingAccount.findUniqueOrThrow({ where: { id: chosen.id } })).toMatchObject({ isActive: false });
    expect(await prisma.adminNotification.findMany({ where: { organisationId: DIST } })).toEqual([
      expect.objectContaining({ userId: USER, type: 'ACCOUNTING_DEFAULT_ACCOUNT_INACTIVE' }),
    ]);
  });
});
