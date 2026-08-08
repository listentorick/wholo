import {
  AccountingConnectionStatus,
  AccountingInvoiceExportStatus,
  OrderLineStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingTaxTypeService } from '../accounting/accounting-tax-type.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingProviderError } from '../accounting/adapters/accounting-provider.error';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AccountingInvoiceExportProcessor } from './accounting-invoice-export.processor';

const makeJob = (payload: Record<string, unknown> = { orderId: 'order-1', distributorId: 'dist-1' }) =>
  ({
    id: 'evt-1',
    name: 'OrderAccepted',
    data: { eventId: 'evt-1', aggregateType: 'Order', aggregateId: 'order-1', payload },
  }) as unknown as Job;

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  distributorId: 'dist-1',
  traderCustomerId: 'cust-1',
  orderNumber: 'ORD-1001',
  status: OrderStatus.ACCEPTED,
  currency: 'GBP',
  subtotalAmount: new Prisma.Decimal('94.04'),
  acceptedAt: new Date('2026-07-09T18:30:00.000Z'),
  lines: [
    {
      id: 'line-1',
      productId: 'prod-1',
      productNameSnapshot: 'Cabernet Sauvignon 2023',
      skuSnapshot: 'CAB-SAUV-001',
      quantityOrdered: 6,
      unitPriceSnapshot: new Prisma.Decimal('12.34'),
      status: OrderLineStatus.ACCEPTED as OrderLineStatus,
      taxTypeId: 'tt-1',
    },
    {
      id: 'line-2',
      productId: 'prod-2',
      productNameSnapshot: 'Merlot 2022',
      skuSnapshot: 'MERLOT-001',
      quantityOrdered: 2,
      unitPriceSnapshot: new Prisma.Decimal('9.9'),
      status: OrderLineStatus.ACCEPTED as OrderLineStatus,
      taxTypeId: 'tt-2',
    },
  ],
  ...overrides,
});

const makeConnection = (overrides: Record<string, unknown> = {}) => ({
  id: 'conn-1',
  distributorId: 'dist-1',
  provider: 'XERO',
  status: AccountingConnectionStatus.CONNECTED,
  externalOrganisationId: 'tenant-1',
  scopes: 'openid accounting.contacts accounting.settings accounting.transactions offline_access',
  invoiceExportTargetStatus: 'DRAFT',
  ...overrides,
});

const makeExportRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'export-1',
  distributorId: 'dist-1',
  accountingConnectionId: 'conn-1',
  provider: 'XERO',
  orderId: 'order-1',
  status: AccountingInvoiceExportStatus.PROCESSING,
  retryCount: 1,
  updatedAt: new Date(),
  ...overrides,
});

const duplicateKeyError = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('AccountingInvoiceExportProcessor', () => {
  let processor: AccountingInvoiceExportProcessor;
  let prisma: {
    order: { findUnique: jest.Mock };
    accountingConnection: { findFirst: jest.Mock };
    accountingInvoiceExport: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    tradeRelationship: { findUnique: jest.Mock };
    customerAccountingMapping: { findFirst: jest.Mock };
    productAccountingMapping: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let connectionService: { getValidTokenSet: jest.Mock };
  let accountingTaxTypes: { resolveExternalCodeForTaxType: jest.Mock };
  let adapter: { hasInvoiceCreationScope: jest.Mock; createInvoice: jest.Mock };
  let outbox: { writeEvent: jest.Mock };
  let audit: { record: jest.Mock };
  let adminNotifications: { notifyOrganisationAdmins: jest.Mock };

  const tokenSet = { accessToken: 'a', refreshToken: 'r', expiresAt: new Date().toISOString(), scope: 's' };

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(makeOrder()) },
      accountingConnection: { findFirst: jest.fn().mockResolvedValue(makeConnection()) },
      accountingInvoiceExport: {
        create: jest.fn().mockResolvedValue(makeExportRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(makeExportRow(data))),
      },
      tradeRelationship: { findUnique: jest.fn().mockResolvedValue({ id: 'tr-1' }) },
      customerAccountingMapping: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'map-1',
          externalContact: { externalContactId: 'xero-contact-1' },
        }),
      },
      productAccountingMapping: {
        findMany: jest.fn().mockResolvedValue([
          {
            productId: 'prod-1',
            externalProduct: { externalProductCode: 'CAB-SAUV-001', accountCode: '200' },
          },
        ]),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    connectionService = { getValidTokenSet: jest.fn().mockResolvedValue(tokenSet) };
    accountingTaxTypes = {
      resolveExternalCodeForTaxType: jest
        .fn()
        .mockImplementation((_connectionId: string, taxTypeId: string) =>
          Promise.resolve(taxTypeId === 'tt-1' ? 'OUTPUT2' : null),
        ),
    };
    adapter = {
      hasInvoiceCreationScope: jest.fn().mockReturnValue(true),
      createInvoice: jest.fn().mockResolvedValue({
        externalInvoiceId: 'inv-1',
        externalInvoiceNumber: 'INV-0042',
        externalInvoiceStatus: 'DRAFT',
        raw: {},
      }),
    };
    outbox = { writeEvent: jest.fn() };
    audit = { record: jest.fn() };
    adminNotifications = { notifyOrganisationAdmins: jest.fn().mockResolvedValue(undefined) };
    processor = new AccountingInvoiceExportProcessor(
      prisma as unknown as PrismaService,
      connectionService as unknown as AccountingConnectionService,
      accountingTaxTypes as unknown as AccountingTaxTypeService,
      { get: jest.fn().mockReturnValue(adapter) } as unknown as AccountingAdapterRegistry,
      outbox as unknown as OutboxService,
      audit as unknown as AuditService,
      adminNotifications as unknown as AdminNotificationsService,
    );
  });

  const completedUpdate = () =>
    prisma.accountingInvoiceExport.update.mock.calls.find(
      (c) => c[0].data.status === AccountingInvoiceExportStatus.COMPLETED,
    );
  const failedUpdate = () =>
    prisma.accountingInvoiceExport.update.mock.calls.find(
      (c) => c[0].data.status === AccountingInvoiceExportStatus.FAILED,
    );

  describe('skips without creating an export record', () => {
    it('when the payload has no orderId', async () => {
      await processor.process(makeJob({}));
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
      expect(prisma.accountingInvoiceExport.create).not.toHaveBeenCalled();
    });

    it('when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await processor.process(makeJob());
      expect(prisma.accountingInvoiceExport.create).not.toHaveBeenCalled();
    });

    it('when the order has been rejected or cancelled since acceptance', async () => {
      prisma.order.findUnique.mockResolvedValue(makeOrder({ status: OrderStatus.CANCELLED }));
      await processor.process(makeJob());
      expect(prisma.accountingInvoiceExport.create).not.toHaveBeenCalled();
    });

    it('when the distributor has no CONNECTED accounting connection (export not enabled)', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(null);
      await processor.process(makeJob());
      expect(prisma.accountingInvoiceExport.create).not.toHaveBeenCalled();
      expect(adapter.createInvoice).not.toHaveBeenCalled();
    });

    it('when the order already has a COMPLETED export on any connection (disconnect/reconnect guard)', async () => {
      prisma.accountingInvoiceExport.findFirst.mockResolvedValue(
        makeExportRow({ accountingConnectionId: 'old-conn', status: AccountingInvoiceExportStatus.COMPLETED }),
      );
      await processor.process(makeJob());
      expect(prisma.accountingInvoiceExport.create).not.toHaveBeenCalled();
      expect(adapter.createInvoice).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('creates the invoice via the adapter and completes the export with the external identifiers', async () => {
      await processor.process(makeJob());

      expect(adapter.createInvoice).toHaveBeenCalledWith(
        tokenSet,
        'tenant-1',
        {
          externalContactId: 'xero-contact-1',
          reference: 'ORD-1001',
          currency: 'GBP',
          issueDate: '2026-07-09',
          targetStatus: 'DRAFT',
          lines: [
            {
              description: 'Cabernet Sauvignon 2023',
              quantity: 6,
              unitPrice: '12.34',
              externalItemCode: 'CAB-SAUV-001',
              taxCode: 'OUTPUT2',
              accountCode: '200',
            },
            // Unmapped product: description-only line (name + SKU), no codes.
            { description: 'Merlot 2022 — MERLOT-001', quantity: 2, unitPrice: '9.90' },
          ],
        },
        'export-1:1',
      );
      expect(completedUpdate()![0]).toEqual(
        expect.objectContaining({
          where: { id: 'export-1' },
          data: expect.objectContaining({
            status: AccountingInvoiceExportStatus.COMPLETED,
            externalInvoiceId: 'inv-1',
            externalInvoiceNumber: 'INV-0042',
            externalInvoiceStatus: 'DRAFT',
          }),
        }),
      );
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        prisma,
        'AccountingInvoiceExport',
        'export-1',
        'AccountingInvoiceExportProcessed',
        expect.objectContaining({ orderId: 'order-1', distributorId: 'dist-1', externalInvoiceId: 'inv-1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          distributorId: 'dist-1',
          entityType: 'ORDER',
          entityId: 'order-1',
          action: 'INVOICE_EXPORT_COMPLETED',
        }),
      );
      expect(adminNotifications.notifyOrganisationAdmins).toHaveBeenCalledWith(
        'dist-1',
        expect.objectContaining({
          type: 'INVOICE_EXPORT_COMPLETED',
          payload: expect.objectContaining({ orderId: 'order-1', externalInvoiceId: 'inv-1' }),
        }),
      );
    });

    it('creates the invoice with the connection-configured target status', async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(
        makeConnection({ invoiceExportTargetStatus: 'AUTHORISED' }),
      );
      await processor.process(makeJob());
      expect(adapter.createInvoice.mock.calls[0][2].targetStatus).toBe('AUTHORISED');
    });

    it('obtains tokens only through getValidTokenSet', async () => {
      await processor.process(makeJob());
      expect(connectionService.getValidTokenSet).toHaveBeenCalledWith('dist-1', 'XERO');
    });

    it('excludes cancelled and rejected lines from the invoice', async () => {
      const order = makeOrder();
      order.lines[1].status = OrderLineStatus.CANCELLED;
      prisma.order.findUnique.mockResolvedValue(order);

      await processor.process(makeJob());

      expect(adapter.createInvoice.mock.calls[0][2].lines).toHaveLength(1);
    });
  });

  describe('tax code resolution', () => {
    it('omits taxCode for a line whose tax type has no confirmed mapping, without failing the export', async () => {
      accountingTaxTypes.resolveExternalCodeForTaxType.mockResolvedValue(null);

      await processor.process(makeJob());

      expect(adapter.createInvoice.mock.calls[0][2].lines[0]).not.toHaveProperty('taxCode');
      expect(failedUpdate()).toBeUndefined();
      expect(completedUpdate()).toBeDefined();
    });

    it('resolves the tax code from the order line taxTypeId, not the product cached tax code', async () => {
      await processor.process(makeJob());

      expect(accountingTaxTypes.resolveExternalCodeForTaxType).toHaveBeenCalledWith('conn-1', 'tt-1');
      expect(accountingTaxTypes.resolveExternalCodeForTaxType).toHaveBeenCalledWith('conn-1', 'tt-2');
      expect(adapter.createInvoice.mock.calls[0][2].lines[0].taxCode).toBe('OUTPUT2');
    });

    it('caches the resolver call per distinct taxTypeId within one export', async () => {
      const order = makeOrder();
      order.lines[1] = { ...order.lines[1], taxTypeId: 'tt-1' };
      prisma.order.findUnique.mockResolvedValue(order);

      await processor.process(makeJob());

      const callsForTt1 = accountingTaxTypes.resolveExternalCodeForTaxType.mock.calls.filter(
        (c) => c[1] === 'tt-1',
      );
      expect(callsForTt1).toHaveLength(1);
    });

    it('resolves independently per distinct taxTypeId', async () => {
      await processor.process(makeJob());

      const distinctIds = new Set(
        accountingTaxTypes.resolveExternalCodeForTaxType.mock.calls.map((c) => c[1]),
      );
      expect(distinctIds).toEqual(new Set(['tt-1', 'tt-2']));
      expect(accountingTaxTypes.resolveExternalCodeForTaxType).toHaveBeenCalledTimes(2);
    });
  });

  describe('idempotent claim on P2002', () => {
    beforeEach(() => {
      prisma.accountingInvoiceExport.create.mockRejectedValue(duplicateKeyError());
    });

    it('no-ops when the existing export is COMPLETED', async () => {
      prisma.accountingInvoiceExport.findUnique.mockResolvedValue(
        makeExportRow({ status: AccountingInvoiceExportStatus.COMPLETED }),
      );
      await processor.process(makeJob());
      expect(adapter.createInvoice).not.toHaveBeenCalled();
      expect(prisma.accountingInvoiceExport.update).not.toHaveBeenCalled();
    });

    it('no-ops when the existing export is PROCESSING and fresh (another attempt in flight)', async () => {
      prisma.accountingInvoiceExport.findUnique.mockResolvedValue(makeExportRow({ updatedAt: new Date() }));
      await processor.process(makeJob());
      expect(adapter.createInvoice).not.toHaveBeenCalled();
    });

    it('resumes a stale PROCESSING export without bumping retryCount (same idempotency key)', async () => {
      prisma.accountingInvoiceExport.findUnique.mockResolvedValue(
        makeExportRow({ retryCount: 3, updatedAt: new Date(Date.now() - 20 * 60 * 1000) }),
      );
      prisma.accountingInvoiceExport.update.mockImplementation(({ data }) =>
        Promise.resolve(makeExportRow({ retryCount: 3, ...data })),
      );

      await processor.process(makeJob());

      const claim = prisma.accountingInvoiceExport.update.mock.calls[0][0];
      expect(claim.data).not.toHaveProperty('retryCount');
      expect(adapter.createInvoice).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'export-1:3',
      );
    });

    it('claims a FAILED export with an incremented retryCount (controlled retry, fresh key)', async () => {
      prisma.accountingInvoiceExport.findUnique.mockResolvedValue(
        makeExportRow({ status: AccountingInvoiceExportStatus.FAILED, retryCount: 1 }),
      );
      prisma.accountingInvoiceExport.update.mockImplementation(({ data }) =>
        Promise.resolve(makeExportRow({ retryCount: 2, status: data.status })),
      );

      await processor.process(makeJob());

      const claim = prisma.accountingInvoiceExport.update.mock.calls[0][0];
      expect(claim.data.retryCount).toEqual({ increment: 1 });
      expect(adapter.createInvoice).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'export-1:2',
      );
    });
  });

  describe('recoverable eligibility failures (marked FAILED, never thrown)', () => {
    it('fails with SCOPE_MISSING when the connection lacks the invoice-creation scope', async () => {
      adapter.hasInvoiceCreationScope.mockReturnValue(false);

      await processor.process(makeJob());

      expect(adapter.createInvoice).not.toHaveBeenCalled();
      expect(failedUpdate()![0].data).toEqual(
        expect.objectContaining({ errorCode: 'SCOPE_MISSING' }),
      );
      expect(outbox.writeEvent).toHaveBeenCalledWith(
        prisma,
        'AccountingInvoiceExport',
        'export-1',
        'AccountingInvoiceExportFailed',
        expect.objectContaining({ orderId: 'order-1', distributorId: 'dist-1', errorCode: 'SCOPE_MISSING' }),
      );
      expect(adminNotifications.notifyOrganisationAdmins).toHaveBeenCalledWith(
        'dist-1',
        expect.objectContaining({ type: 'INVOICE_EXPORT_FAILED', payload: expect.objectContaining({ errorCode: 'SCOPE_MISSING' }) }),
      );
    });

    it('fails with CUSTOMER_NOT_MAPPED when the customer has no confirmed contact mapping', async () => {
      prisma.customerAccountingMapping.findFirst.mockResolvedValue(null);

      await processor.process(makeJob());

      expect(adapter.createInvoice).not.toHaveBeenCalled();
      expect(failedUpdate()![0].data).toEqual(
        expect.objectContaining({
          errorCode: 'CUSTOMER_NOT_MAPPED',
          errorMessage: 'Cannot create accounting invoice because the customer is not linked to an accounting contact.',
        }),
      );
    });

    it('fails with CUSTOMER_NOT_MAPPED when no trade relationship exists', async () => {
      prisma.tradeRelationship.findUnique.mockResolvedValue(null);

      await processor.process(makeJob());

      expect(prisma.customerAccountingMapping.findFirst).not.toHaveBeenCalled();
      expect(failedUpdate()![0].data).toEqual(expect.objectContaining({ errorCode: 'CUSTOMER_NOT_MAPPED' }));
      expect(audit.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          distributorId: 'dist-1',
          entityType: 'ORDER',
          entityId: 'order-1',
          action: 'INVOICE_EXPORT_FAILED',
          changes: expect.objectContaining({ errorCode: 'CUSTOMER_NOT_MAPPED' }),
        }),
      );
    });

    it('fails with ORDER_NOT_INVOICEABLE when every line is cancelled or rejected', async () => {
      const order = makeOrder();
      order.lines[0].status = OrderLineStatus.CANCELLED;
      order.lines[1].status = OrderLineStatus.REJECTED;
      prisma.order.findUnique.mockResolvedValue(order);

      await processor.process(makeJob());

      expect(adapter.createInvoice).not.toHaveBeenCalled();
      expect(failedUpdate()![0].data).toEqual(expect.objectContaining({ errorCode: 'ORDER_NOT_INVOICEABLE' }));
    });
  });

  describe('provider failures', () => {
    it('marks FAILED and rethrows transient provider errors so the queue retries', async () => {
      adapter.createInvoice.mockRejectedValue(new AccountingProviderError('Xero 503', true));

      await expect(processor.process(makeJob())).rejects.toThrow('Xero 503');

      expect(failedUpdate()![0].data).toEqual(
        expect.objectContaining({ errorCode: 'PROVIDER_ERROR', errorMessage: 'Xero 503' }),
      );
    });

    it('marks FAILED and rethrows token refresh failures (transient)', async () => {
      connectionService.getValidTokenSet.mockRejectedValue(new Error('refresh failed'));

      await expect(processor.process(makeJob())).rejects.toThrow('refresh failed');

      expect(failedUpdate()![0].data).toEqual(expect.objectContaining({ errorCode: 'PROVIDER_ERROR' }));
    });

    it('marks FAILED without rethrowing permanent provider errors (waits for user action + manual retry)', async () => {
      adapter.createInvoice.mockRejectedValue(
        new AccountingProviderError('Xero rejected the invoice: Account code 999 is not valid', false),
      );

      await expect(processor.process(makeJob())).resolves.toBeUndefined();

      expect(failedUpdate()![0].data).toEqual(
        expect.objectContaining({
          errorCode: 'PROVIDER_ERROR',
          errorMessage: 'Xero rejected the invoice: Account code 999 is not valid',
        }),
      );
    });
  });

  it('handles the manual-retry event the same as OrderAccepted', async () => {
    const job = makeJob();
    (job as { name: string }).name = 'AccountingInvoiceExportRequested';

    await processor.process(job);

    expect(adapter.createInvoice).toHaveBeenCalled();
  });
});
