import { Logger } from '@nestjs/common';
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
  accountingOrganisationId: 'acc-org-1',
  scopes: 'openid accounting.contacts accounting.settings accounting.transactions offline_access',
  organisation: { id: 'acc-org-1', externalOrganisationId: 'tenant-1', name: 'Acme Wines', invoiceExportTargetStatus: 'DRAFT' },
  ...overrides,
});

const makeExportRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'export-1',
  distributorId: 'dist-1',
  accountingOrganisationId: 'acc-org-1',
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
  let adapter: { hasInvoiceCreationScope: jest.Mock; findInvoiceByReference: jest.Mock; createInvoice: jest.Mock };
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
      // The provider holds no invoice for the order unless a test says so.
      findInvoiceByReference: jest.fn().mockResolvedValue(null),
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
      { get: jest.fn().mockReturnValue(adapter), displayName: () => 'Xero' } as unknown as AccountingAdapterRegistry,
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

    it('when the order already has a COMPLETED export in any organisation (switching company guard)', async () => {
      prisma.accountingInvoiceExport.findFirst.mockResolvedValue(
        makeExportRow({ accountingOrganisationId: 'other-acc-org', status: AccountingInvoiceExportStatus.COMPLETED }),
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
        expect.stringMatching(/^export-1:[0-9a-f]{32}$/),
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

    it("creates the invoice with the organisation's configured target status", async () => {
      prisma.accountingConnection.findFirst.mockResolvedValue(
        makeConnection({
          organisation: { id: 'acc-org-1', externalOrganisationId: 'tenant-1', name: 'Acme Wines', invoiceExportTargetStatus: 'AUTHORISED' },
        }),
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

      expect(accountingTaxTypes.resolveExternalCodeForTaxType).toHaveBeenCalledWith('acc-org-1', 'tt-1');
      expect(accountingTaxTypes.resolveExternalCodeForTaxType).toHaveBeenCalledWith('acc-org-1', 'tt-2');
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

    it('resumes a stale PROCESSING export without counting it as another attempt', async () => {
      prisma.accountingInvoiceExport.findUnique.mockResolvedValue(
        makeExportRow({ retryCount: 3, updatedAt: new Date(Date.now() - 20 * 60 * 1000) }),
      );
      prisma.accountingInvoiceExport.update.mockImplementation(({ data }) =>
        Promise.resolve(makeExportRow({ retryCount: 3, ...data })),
      );

      await processor.process(makeJob());

      const claim = prisma.accountingInvoiceExport.update.mock.calls[0][0];
      expect(claim.data).not.toHaveProperty('retryCount');
      expect(completedUpdate()).toBeDefined();
    });

    it('claims a FAILED export as a counted retry', async () => {
      prisma.accountingInvoiceExport.findUnique.mockResolvedValue(
        makeExportRow({ status: AccountingInvoiceExportStatus.FAILED, retryCount: 1 }),
      );
      prisma.accountingInvoiceExport.update.mockImplementation(({ data }) =>
        Promise.resolve(makeExportRow({ retryCount: 2, status: data.status })),
      );

      await processor.process(makeJob());

      const claim = prisma.accountingInvoiceExport.update.mock.calls[0][0];
      expect(claim.data.retryCount).toEqual({ increment: 1 });
      expect(completedUpdate()).toBeDefined();
    });
  });

  // ADR-073: raising a second invoice for an order is unacceptable. Each test
  // below is one way it used to be possible; none may create a second invoice.
  describe('never invoices an order twice (ADR-073)', () => {
    const invoiceAtProvider = {
      externalInvoiceId: 'inv-already-there',
      externalInvoiceNumber: 'INV-0007',
      externalInvoiceStatus: 'AUTHORISED',
      raw: {},
    };
    const expectAdoptedWithoutCreating = () => {
      expect(adapter.createInvoice).not.toHaveBeenCalled();
      expect(completedUpdate()![0].data).toEqual(
        expect.objectContaining({ externalInvoiceId: 'inv-already-there', externalInvoiceNumber: 'INV-0007' }),
      );
      expect(failedUpdate()).toBeUndefined();
    };
    const existingRow = (overrides: Record<string, unknown>) => {
      prisma.accountingInvoiceExport.create.mockRejectedValue(duplicateKeyError());
      prisma.accountingInvoiceExport.findUnique.mockResolvedValue(makeExportRow(overrides));
    };

    it('asks the provider for the order\'s invoice before every create', async () => {
      const calls: string[] = [];
      adapter.findInvoiceByReference.mockImplementation(async () => {
        calls.push('find');
        return null;
      });
      adapter.createInvoice.mockImplementation(async () => {
        calls.push('create');
        return invoiceAtProvider;
      });

      await processor.process(makeJob());

      expect(calls).toEqual(['find', 'create']);
      expect(adapter.findInvoiceByReference).toHaveBeenCalledWith(tokenSet, 'tenant-1', 'ORD-1001');
    });

    it('path 1 — the provider created the invoice but the call failed: the retry adopts it', async () => {
      // First attempt: the provider created it, we got a 503.
      adapter.createInvoice.mockRejectedValue(
        new AccountingProviderError('Xero 503', true, undefined, 'HTTP_503', { statusCode: 503, outcomeUnknown: true }),
      );
      await expect(processor.process(makeJob())).rejects.toThrow('Xero 503');
      expect(adapter.createInvoice).toHaveBeenCalledTimes(1);

      // The retry claims the FAILED row; the provider now reports the invoice.
      adapter.createInvoice.mockClear();
      prisma.accountingInvoiceExport.update.mockClear();
      existingRow({ status: AccountingInvoiceExportStatus.FAILED });
      adapter.findInvoiceByReference.mockResolvedValue(invoiceAtProvider);

      await processor.process(makeJob());

      expectAdoptedWithoutCreating();
    });

    it('path 2 — the invoice was created but we failed to save it: not a failed export, and the retry adopts it', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));

      await expect(processor.process(makeJob())).rejects.toThrow('database unavailable');

      // Nothing tells the user (or a retry) that the export failed…
      expect(failedUpdate()).toBeUndefined();
      expect(outbox.writeEvent).not.toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), 'AccountingInvoiceExportFailed', expect.anything(),
      );
      expect(adminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
      // …and the claim is released so the retry can take the row.
      expect(prisma.accountingInvoiceExport.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { status: AccountingInvoiceExportStatus.PENDING } }),
      );

      adapter.createInvoice.mockClear();
      prisma.accountingInvoiceExport.update.mockClear();
      existingRow({ status: AccountingInvoiceExportStatus.PENDING });
      adapter.findInvoiceByReference.mockResolvedValue(invoiceAtProvider);

      await processor.process(makeJob());

      expectAdoptedWithoutCreating();
    });

    it('path 3 — the worker died after the provider created the invoice: resuming the stale claim adopts it', async () => {
      existingRow({ updatedAt: new Date(Date.now() - 20 * 60 * 1000) });
      adapter.findInvoiceByReference.mockResolvedValue(invoiceAtProvider);

      await processor.process(makeJob());

      expectAdoptedWithoutCreating();
    });

    it('path 4 — the provider call timed out: the retry adopts the invoice the provider went on to create', async () => {
      adapter.createInvoice.mockRejectedValue(
        new AccountingProviderError('Xero createInvoices did not respond within 60s', true, undefined, 'NETWORK', {
          outcomeUnknown: true,
        }),
      );
      await expect(processor.process(makeJob())).rejects.toThrow('did not respond');

      adapter.createInvoice.mockClear();
      prisma.accountingInvoiceExport.update.mockClear();
      existingRow({ status: AccountingInvoiceExportStatus.FAILED });
      adapter.findInvoiceByReference.mockResolvedValue(invoiceAtProvider);

      await processor.process(makeJob());

      expectAdoptedWithoutCreating();
    });

    it('adopts on a first attempt too — our own export record may have been lost (database restore)', async () => {
      adapter.findInvoiceByReference.mockResolvedValue(invoiceAtProvider);

      await processor.process(makeJob());

      expectAdoptedWithoutCreating();
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ summary: 'Invoice INV-0007 found in Xero from an earlier attempt' }),
      );
    });

    it('does not create when it cannot tell whether the provider has the invoice', async () => {
      adapter.findInvoiceByReference.mockRejectedValue(new AccountingProviderError('Xero getInvoices failed with HTTP 503', true));

      await expect(processor.process(makeJob())).rejects.toThrow('HTTP 503');

      expect(adapter.createInvoice).not.toHaveBeenCalled();
    });

    it('still creates the invoice on a retry when the provider has none (a rejected export, fixed and retried)', async () => {
      existingRow({ status: AccountingInvoiceExportStatus.FAILED });

      await processor.process(makeJob());

      expect(adapter.createInvoice).toHaveBeenCalledTimes(1);
      expect(completedUpdate()![0].data).toEqual(expect.objectContaining({ externalInvoiceId: 'inv-1' }));
    });

    it('a failed "invoice created" notification does not fail the export', async () => {
      adminNotifications.notifyOrganisationAdmins.mockRejectedValue(new Error('notifications down'));

      await expect(processor.process(makeJob())).resolves.toBeUndefined();

      expect(completedUpdate()).toBeDefined();
      expect(failedUpdate()).toBeUndefined();
    });

    it('replays the same idempotency key while the request is unchanged, and a new one when it changes', async () => {
      const keyOf = (call: number) => adapter.createInvoice.mock.calls[call][3] as string;

      await processor.process(makeJob());
      existingRow({ status: AccountingInvoiceExportStatus.FAILED, retryCount: 2 });
      await processor.process(makeJob());
      // A mapping is fixed between attempts: the invoice content changes.
      prisma.productAccountingMapping.findMany.mockResolvedValue([]);
      await processor.process(makeJob());

      expect(keyOf(1)).toBe(keyOf(0));
      expect(keyOf(2)).not.toBe(keyOf(0));
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

    describe('when our own call budget is exhausted (ADR-071)', () => {
      const budgetExhausted = () =>
        new AccountingProviderError('XERO call budget for this organisation is exhausted — retrying later', true, undefined, 'CALL_BUDGET_EXHAUSTED', {
          retryAfterMs: 12_000,
        });
      const withAttempts = (attemptsMade: number, attempts: number) =>
        ({ ...(makeJob() as object), attemptsMade, opts: { attempts } }) as unknown as Job;

      it('defers quietly with attempts left: back to PENDING, rethrown for backoff, nothing reported', async () => {
        adapter.createInvoice.mockRejectedValue(budgetExhausted());

        await expect(processor.process(withAttempts(1, 5))).rejects.toThrow('call budget');

        expect(prisma.accountingInvoiceExport.update).toHaveBeenLastCalledWith(
          expect.objectContaining({ data: { status: AccountingInvoiceExportStatus.PENDING } }),
        );
        expect(failedUpdate()).toBeUndefined();
        expect(audit.record).not.toHaveBeenCalled();
        expect(outbox.writeEvent).not.toHaveBeenCalled();
        expect(adminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
      });

      it('reports it as a failure on the final attempt, so a stuck export is visible and retryable', async () => {
        adapter.createInvoice.mockRejectedValue(budgetExhausted());

        await expect(processor.process(withAttempts(4, 5))).rejects.toThrow('call budget');

        expect(failedUpdate()![0].data).toEqual(expect.objectContaining({ status: AccountingInvoiceExportStatus.FAILED }));
        expect(adminNotifications.notifyOrganisationAdmins).toHaveBeenCalled();
      });
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

    it('never stores or shows an unexpected error text — it may carry query data — but logs it with the stack', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      adapter.createInvoice.mockRejectedValue(new TypeError('Invalid `prisma.x()` invocation: { email: "jane@customer.com" }'));

      await expect(processor.process(makeJob())).rejects.toThrow(TypeError);

      const stored = failedUpdate()![0].data.errorMessage as string;
      expect(stored).toBe('Unexpected error while creating the invoice — it will be retried automatically.');
      const [fields] = error.mock.calls.find(([f]) => (f as { event?: string }).event === 'accounting.invoice_export.unexpected_error')!;
      expect(fields).toMatchObject({ distributorId: expect.any(String), exportId: expect.any(String), orderId: expect.any(String) });
      expect((fields as { err: Error }).err.stack).toContain('TypeError');
      jest.restoreAllMocks();
    });

    it('logs a provider failure once, structured, with the provider status for alerting', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      adapter.createInvoice.mockRejectedValue(
        new AccountingProviderError('Xero createInvoices failed with HTTP 503', true, undefined, 'HTTP_503', { statusCode: 503 }),
      );

      await processor.process(makeJob()).catch(() => undefined);

      const failed = warn.mock.calls.filter(([f]) => (f as { event?: string }).event === 'accounting.invoice_export.failed');
      expect(failed).toHaveLength(1);
      expect(failed[0][0]).toMatchObject({ errorCode: 'PROVIDER_ERROR', code: 'HTTP_503', statusCode: 503, transient: true });
      jest.restoreAllMocks();
    });
  });

  it('handles the manual-retry event the same as OrderAccepted', async () => {
    const job = makeJob();
    (job as { name: string }).name = 'AccountingInvoiceExportRequested';

    await processor.process(job);

    expect(adapter.createInvoice).toHaveBeenCalled();
  });
});
