import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { IngestionRunService } from '../ingestion/ingestion-run.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { AccountingAdapterRegistry } from '../accounting/adapters/accounting-adapter.registry';
import { AccountingExternalInvoiceStatus } from '../accounting/adapters/accounting-connection-adapter.interface';
import { AccountingInvoiceSyncProcessor } from './accounting-invoice-sync.processor';
import { INVOICE_PAYMENT_STATUS_CHANGED } from '../accounting/invoice-payment-status';
import { InvoicePaymentStateService } from '../accounting/invoice-payment-state.service';
import { AuditService } from '../audit/audit.service';
import { OrderCompletionService } from '../orders/order-completion.service';

const connection = {
  id: 'conn-1',
  distributorId: 'dist-1',
  provider: 'XERO',
  status: 'CONNECTED',
  accountingOrganisationId: 'acc-org-1',
  organisation: { id: 'acc-org-1', externalOrganisationId: 'tenant-1', name: 'Acme Wines', invoiceExportTargetStatus: 'DRAFT' },
  scopes: 'openid accounting.invoices',
};

function exportRow(over: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    distributorId: 'dist-1',
    accountingOrganisationId: 'acc-org-1',
    provider: 'XERO',
    orderId: 'order-1',
    status: 'COMPLETED',
    externalInvoiceId: 'inv-1',
    externalInvoiceNumber: 'INV-0001',
    externalInvoiceStatus: 'AUTHORISED',
    invoiceState: 'AWAITING_PAYMENT',
    invoiceTotal: new Prisma.Decimal('120.00'),
    amountPaid: new Prisma.Decimal('0'),
    amountCredited: new Prisma.Decimal('0'),
    amountDue: new Prisma.Decimal('120.00'),
    issueDate: new Date('2026-09-01T00:00:00Z'),
    dueDate: new Date('2026-09-30T00:00:00Z'),
    fullyPaidOn: null,
    providerUpdatedAt: new Date('2026-09-01T10:00:00Z'),
    order: { traderCustomerId: 'cust-1', currency: 'GBP' },
    ...over,
  };
}

function status(over: Partial<AccountingExternalInvoiceStatus> = {}): AccountingExternalInvoiceStatus {
  return {
    externalInvoiceId: 'inv-1',
    externalInvoiceNumber: 'INV-0001',
    state: 'AWAITING_PAYMENT',
    rawStatus: 'AUTHORISED',
    currency: 'GBP',
    total: '120',
    amountPaid: '0',
    amountCredited: '0',
    amountDue: '120',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    fullyPaidOn: null,
    providerUpdatedAt: new Date('2026-09-01T10:00:00Z'),
    ...over,
  };
}

function makeJob(over: Record<string, unknown> = {}): Job {
  return {
    id: 'job-1',
    name: 'AccountingInvoiceSyncRequested',
    data: { eventId: 'evt-1', aggregateType: 'AccountingConnection', aggregateId: 'conn-1', payload: { runId: 'run-1' } },
    ...over,
  } as unknown as Job;
}

describe('AccountingInvoiceSyncProcessor', () => {
  let processor: AccountingInvoiceSyncProcessor;
  let exports: ReturnType<typeof exportRow>[];
  let updates: Array<{ where: { id: string }; data: Record<string, unknown> }>;
  let events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  let audits: Array<Record<string, unknown>>;
  let reconciled: string[];
  let listInvoiceStatuses: jest.Mock;
  let ingestionRuns: Record<string, jest.Mock>;
  let hasInvoiceReadScope: jest.Mock;

  beforeEach(() => {
    exports = [exportRow()];
    updates = [];
    events = [];
    audits = [];
    reconciled = [];
    listInvoiceStatuses = jest.fn().mockResolvedValue({ records: [], nextCursor: 'cursor-next' });
    hasInvoiceReadScope = jest.fn().mockReturnValue(true);
    const tx = {
      accountingInvoiceExport: {
        update: jest.fn(async (args) => updates.push(args)),
        findUniqueOrThrow: jest.fn(async ({ where }) => exports.find((e) => e.id === where.id)),
      },
    };
    const prisma = {
      accountingConnection: { findUnique: jest.fn().mockResolvedValue(connection), update: jest.fn() },
      accountingInvoiceExport: {
        findMany: jest.fn(async ({ where }) =>
          exports.filter((e) => (where.externalInvoiceId.in as string[]).includes(e.externalInvoiceId as string)),
        ),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const outbox = {
      writeEvent: jest.fn(async (_tx, _type, _id, eventType, payload) => events.push({ eventType, payload })),
    };
    ingestionRuns = {
      ensureRun: jest.fn(),
      claim: jest.fn().mockResolvedValue({ id: 'run-1', trigger: 'SCHEDULED', cursor: 'cursor-stored', lastFullRunAt: new Date() }),
      setTotal: jest.fn(),
      heartbeat: jest.fn(),
      finalizeSuccess: jest.fn(),
      finalizeFailure: jest.fn(),
      requeueForRetry: jest.fn(),
    };
    processor = new AccountingInvoiceSyncProcessor(
      prisma as unknown as PrismaService,
      { getValidTokenSet: jest.fn().mockResolvedValue({}) } as unknown as AccountingConnectionService,
      { get: () => ({ listInvoiceStatuses, hasInvoiceReadScope }), displayName: () => 'Xero' } as unknown as AccountingAdapterRegistry,
      ingestionRuns as unknown as IngestionRunService,
      new InvoicePaymentStateService(
        { record: jest.fn(async (_tx, params) => audits.push(params)) } as unknown as AuditService,
        outbox as unknown as OutboxService,
        {
          lockOrder: jest.fn(),
          reconcile: jest.fn(async (_tx, orderId: string) => reconciled.push(orderId)),
        } as unknown as OrderCompletionService,
      ),
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('marks the order paid when the accounting system reports the invoice paid, and emits the transition', async () => {
    listInvoiceStatuses.mockResolvedValue({
      records: [
        status({
          state: 'PAID',
          rawStatus: 'PAID',
          amountPaid: '120',
          amountDue: '0',
          fullyPaidOn: '2026-09-20',
          providerUpdatedAt: new Date('2026-09-20T09:00:00Z'),
        }),
      ],
      nextCursor: 'cursor-next',
    });

    await processor.process(makeJob());

    expect(updates).toHaveLength(1);
    expect(updates[0].data).toMatchObject({
      invoiceState: 'PAID',
      amountDue: '0',
      fullyPaidOn: new Date('2026-09-20T00:00:00.000Z'),
      externalInvoiceStatus: 'PAID',
    });
    expect(events).toEqual([
      {
        eventType: INVOICE_PAYMENT_STATUS_CHANGED,
        payload: expect.objectContaining({
          exportId: 'exp-1',
          orderId: 'order-1',
          distributorId: 'dist-1',
          customerId: 'cust-1',
          fromStatus: 'UNPAID',
          toStatus: 'PAID',
          dueDate: '2026-09-30',
          fullyPaidOn: '2026-09-20',
          occurredAt: '2026-09-20T09:00:00.000Z',
        }),
      },
    ]);
    expect(audits).toEqual([
      expect.objectContaining({
        entityType: 'ORDER',
        entityId: 'order-1',
        action: 'INVOICE_PAYMENT_STATUS_CHANGED',
        actorType: 'SYSTEM',
        summary: 'Invoice INV-0001 marked paid in Xero',
      }),
    ]);
    expect(reconciled).toEqual(['order-1']);
    expect(ingestionRuns.finalizeSuccess).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ recordsProcessed: 1, recordsUpdated: 1, detailCount: 1 }),
      { cursor: 'cursor-next', full: false },
    );
  });

  it('records a part payment as PART_PAID', async () => {
    listInvoiceStatuses.mockResolvedValue({
      records: [status({ amountPaid: '50', amountDue: '70', providerUpdatedAt: new Date('2026-09-10T00:00:00Z') })],
      nextCursor: null,
    });

    await processor.process(makeJob());

    expect(events[0].payload).toMatchObject({ fromStatus: 'UNPAID', toStatus: 'PART_PAID', amountDue: '70' });
  });

  it('updates the row but emits no event when only non-payment facts move (e.g. the due date)', async () => {
    listInvoiceStatuses.mockResolvedValue({
      records: [status({ dueDate: '2026-10-15', providerUpdatedAt: new Date('2026-09-05T00:00:00Z') })],
      nextCursor: null,
    });

    await processor.process(makeJob());

    expect(updates[0].data).toMatchObject({ dueDate: new Date('2026-10-15T00:00:00.000Z') });
    expect(events).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(reconciled).toHaveLength(0);
  });

  it('writes nothing when nothing changed', async () => {
    listInvoiceStatuses.mockResolvedValue({ records: [status()], nextCursor: null });

    await processor.process(makeJob());

    expect(updates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('ignores invoices Stocdup did not create', async () => {
    listInvoiceStatuses.mockResolvedValue({ records: [status({ externalInvoiceId: 'someone-elses' })], nextCursor: null });

    await processor.process(makeJob());

    expect(updates).toHaveLength(0);
  });

  it('never lets an older snapshot overwrite a newer one', async () => {
    exports = [exportRow({ invoiceState: 'PAID', amountDue: new Prisma.Decimal('0'), providerUpdatedAt: new Date('2026-09-20T00:00:00Z') })];
    listInvoiceStatuses.mockResolvedValue({
      records: [status({ providerUpdatedAt: new Date('2026-09-10T00:00:00Z') })],
      nextCursor: null,
    });

    await processor.process(makeJob());

    expect(updates).toHaveLength(0);
  });

  it('heartbeats the run while applying a large snapshot, so a live sync is never taken for a dead one', async () => {
    listInvoiceStatuses.mockResolvedValue({
      records: Array.from({ length: 60 }, (_, i) => status({ externalInvoiceId: `not-ours-${i}` })),
      nextCursor: null,
    });

    await processor.process(makeJob());

    expect(ingestionRuns.heartbeat.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(ingestionRuns.heartbeat).toHaveBeenCalledWith('run-1', expect.any(Object));
  });

  it('pulls incrementally from the stored cursor, and in full on a manual Sync', async () => {
    await processor.process(makeJob());
    expect(listInvoiceStatuses).toHaveBeenLastCalledWith(expect.anything(), 'tenant-1', 'cursor-stored');

    ingestionRuns.claim.mockResolvedValue({ id: 'run-1', trigger: 'MANUAL', cursor: 'cursor-stored', lastFullRunAt: new Date() });
    await processor.process(makeJob());
    expect(listInvoiceStatuses).toHaveBeenLastCalledWith(expect.anything(), 'tenant-1', null);
  });

  it('fails permanently (no retries) when the connection lacks permission to read invoices', async () => {
    hasInvoiceReadScope.mockReturnValue(false);

    const err = await processor.process(makeJob()).catch((e) => e);

    expect(err).toBeInstanceOf(UnrecoverableError);
    expect(listInvoiceStatuses).not.toHaveBeenCalled();
    expect(ingestionRuns.finalizeFailure).toHaveBeenCalledWith('run-1', expect.stringContaining('Reconnect'));
  });

  it('re-queues the run for a retry on a transient failure with attempts left', async () => {
    listInvoiceStatuses.mockRejectedValue(new Error('socket hang up'));

    await processor.process(makeJob({ attemptsMade: 0, opts: { attempts: 3 } })).catch(() => undefined);

    expect(ingestionRuns.requeueForRetry).toHaveBeenCalledWith('run-1', 'socket hang up');
    expect(ingestionRuns.finalizeFailure).not.toHaveBeenCalled();
  });
});
