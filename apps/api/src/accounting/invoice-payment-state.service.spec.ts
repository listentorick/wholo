import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { OrderCompletionService } from '../orders/order-completion.service';
import { INVOICE_PAYMENT_STATUS_CHANGED } from './invoice-payment-status';
import { ExportWithOrder, InvoicePaymentStateService, SyncedState } from './invoice-payment-state.service';

function current(over: Partial<ExportWithOrder> = {}): ExportWithOrder {
  return {
    id: 'exp-1',
    distributorId: 'dist-1',
    accountingConnectionId: 'conn-1',
    provider: 'XERO',
    orderId: 'order-1',
    status: 'COMPLETED',
    externalInvoiceId: 'inv-1',
    externalInvoiceNumber: 'INV-0001',
    externalInvoiceStatus: 'AUTHORISED',
    invoiceState: 'AWAITING_PAYMENT',
    invoiceTotal: new Prisma.Decimal('120'),
    amountPaid: new Prisma.Decimal('0'),
    amountCredited: new Prisma.Decimal('0'),
    amountDue: new Prisma.Decimal('120'),
    issueDate: new Date('2026-09-01T00:00:00Z'),
    dueDate: new Date('2026-09-30T00:00:00Z'),
    fullyPaidOn: null,
    providerUpdatedAt: new Date('2026-09-01T10:00:00Z'),
    order: { traderCustomerId: 'cust-1', currency: 'GBP' },
    ...over,
  } as ExportWithOrder;
}

function next(over: Partial<SyncedState> = {}): SyncedState {
  return {
    invoiceState: 'AWAITING_PAYMENT',
    invoiceTotal: '120',
    amountPaid: '0',
    amountCredited: '0',
    amountDue: '120',
    issueDate: new Date('2026-09-01T00:00:00Z'),
    dueDate: new Date('2026-09-30T00:00:00Z'),
    fullyPaidOn: null,
    providerUpdatedAt: new Date('2026-09-01T10:00:00Z'),
    externalInvoiceNumber: 'INV-0001',
    externalInvoiceStatus: 'AUTHORISED',
    ...over,
  };
}

const paid = next({
  invoiceState: 'PAID',
  amountPaid: '120',
  amountDue: '0',
  fullyPaidOn: new Date('2026-09-20T00:00:00Z'),
  providerUpdatedAt: new Date('2026-09-20T09:00:00Z'),
  externalInvoiceStatus: 'PAID',
});

describe('InvoicePaymentStateService', () => {
  let service: InvoicePaymentStateService;
  let rowWrites: Array<Record<string, unknown>>;
  let events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  let audits: Array<Record<string, unknown>>;
  let locked: string[];
  let reconciled: Array<{ orderId: string; actor: unknown }>;
  const tx = {
    accountingInvoiceExport: { update: jest.fn(async ({ data }) => rowWrites.push(data)) },
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    rowWrites = [];
    events = [];
    audits = [];
    locked = [];
    reconciled = [];
    service = new InvoicePaymentStateService(
      { record: jest.fn(async (_tx, params) => audits.push(params)) } as unknown as AuditService,
      { writeEvent: jest.fn(async (_tx, _t, _id, eventType, payload) => events.push({ eventType, payload })) } as unknown as OutboxService,
      {
        lockOrder: jest.fn(async (_tx, orderId: string) => locked.push(orderId)),
        reconcile: jest.fn(async (_tx, orderId: string, actor: unknown) => reconciled.push({ orderId, actor })),
      } as unknown as OrderCompletionService,
    );
  });

  const ctx = { source: 'XERO', currency: 'GBP', actor: { type: 'SYSTEM' as const } };

  it('writes nothing when the snapshot has not changed', async () => {
    const result = await service.apply(tx, current(), next(), ctx);

    expect(result).toEqual({ changed: false, fromStatus: 'UNPAID', toStatus: 'UNPAID' });
    expect(rowWrites).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(locked).toHaveLength(0);
  });

  it('updates the row but records no transition when only non-payment facts move', async () => {
    const result = await service.apply(tx, current(), next({ dueDate: new Date('2026-10-15T00:00:00Z') }), ctx);

    expect(result).toEqual({ changed: true, fromStatus: 'UNPAID', toStatus: 'UNPAID' });
    expect(rowWrites[0]).toMatchObject({ dueDate: new Date('2026-10-15T00:00:00Z') });
    expect(events).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(reconciled).toHaveLength(0);
  });

  it('on a payment status change writes the event, the order audit row and reconciles completion, after locking the order', async () => {
    const result = await service.apply(tx, current(), paid, ctx);

    expect(result).toEqual({ changed: true, fromStatus: 'UNPAID', toStatus: 'PAID' });
    expect(locked).toEqual(['order-1']);
    expect(rowWrites[0]).toMatchObject({ invoiceState: 'PAID', amountDue: '0' });
    expect(events).toEqual([
      {
        eventType: INVOICE_PAYMENT_STATUS_CHANGED,
        payload: expect.objectContaining({
          exportId: 'exp-1',
          orderId: 'order-1',
          customerId: 'cust-1',
          provider: 'XERO',
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
        distributorId: 'dist-1',
        entityType: 'ORDER',
        entityId: 'order-1',
        action: 'INVOICE_PAYMENT_STATUS_CHANGED',
        actorType: 'SYSTEM',
        summary: 'Invoice INV-0001 marked paid in XERO',
        changes: expect.objectContaining({ fromStatus: 'UNPAID', toStatus: 'PAID' }),
      }),
    ]);
    expect(reconciled).toEqual([{ orderId: 'order-1', actor: { type: 'SYSTEM' } }]);
  });

  it('records whoever made the change', async () => {
    await service.apply(tx, current(), paid, { source: 'Stocdup', actor: { type: 'USER', userId: 'user-1', name: 'Pat' } });

    expect(audits[0]).toMatchObject({ actorType: 'USER', actorUserId: 'user-1', actorName: 'Pat', summary: 'Invoice INV-0001 marked paid in Stocdup' });
    expect(reconciled[0].actor).toEqual({ type: 'USER', userId: 'user-1', name: 'Pat' });
  });

  it("falls back to the order's currency when the source does not report one", async () => {
    await service.apply(tx, current(), paid, { ...ctx, currency: null });

    expect(events[0].payload).toMatchObject({ currency: 'GBP' });
  });
});
