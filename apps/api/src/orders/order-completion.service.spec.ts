import { OrderStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { InvoicePaymentStatus } from '../accounting/invoice-payment-status';
import {
  ORDER_COMPLETED,
  ORDER_COMPLETION_REVERSED,
  OrderCompletionService,
  resolveCompletion,
} from './order-completion.service';

describe('resolveCompletion', () => {
  const statuses = Object.values(OrderStatus);
  const payments: InvoicePaymentStatus[] = ['NOT_SYNCED', 'UNPAID', 'PART_PAID', 'PAID', 'VOID'];

  it('completes a delivered order once it is paid', () => {
    expect(resolveCompletion(OrderStatus.DELIVERED, 'PAID')).toBe(OrderStatus.COMPLETED);
  });

  it.each(payments.filter((p) => p !== 'PAID'))('reopens a completed order whose invoice becomes %s', (payment) => {
    expect(resolveCompletion(OrderStatus.COMPLETED, payment)).toBe(OrderStatus.DELIVERED);
  });

  it('changes nothing in any other combination', () => {
    const changing = new Set([`${OrderStatus.DELIVERED}:PAID`, ...payments.filter((p) => p !== 'PAID').map((p) => `${OrderStatus.COMPLETED}:${p}`)]);
    for (const status of statuses) {
      for (const payment of payments) {
        if (changing.has(`${status}:${payment}`)) continue;
        expect({ status, payment, next: resolveCompletion(status, payment) }).toEqual({ status, payment, next: null });
      }
    }
  });
});

describe('OrderCompletionService.reconcile', () => {
  let service: OrderCompletionService;
  let orderRow: Record<string, unknown>;
  let statusWrites: Array<{ id: string; status: OrderStatus }>;
  let audits: Array<Record<string, unknown>>;
  let events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  let tx: Prisma.TransactionClient;

  const paidInvoice = {
    status: 'COMPLETED',
    externalInvoiceId: 'inv-1',
    externalInvoiceNumber: 'INV-0001',
    invoiceState: 'PAID',
    invoiceTotal: new Prisma.Decimal('120'),
    amountPaid: new Prisma.Decimal('120'),
    amountCredited: new Prisma.Decimal('0'),
    amountDue: new Prisma.Decimal('0'),
  };

  beforeEach(() => {
    statusWrites = [];
    audits = [];
    events = [];
    orderRow = {
      id: 'order-1',
      distributorId: 'dist-1',
      traderCustomerId: 'cust-1',
      status: OrderStatus.DELIVERED,
      invoiceExports: [paidInvoice],
    };
    tx = {
      order: {
        findUniqueOrThrow: jest.fn(async () => orderRow),
        update: jest.fn(async ({ where, data }) => statusWrites.push({ id: where.id, status: data.status })),
      },
    } as unknown as Prisma.TransactionClient;
    service = new OrderCompletionService(
      { record: jest.fn(async (_tx, params) => audits.push(params)) } as unknown as AuditService,
      { writeEvent: jest.fn(async (_tx, _t, _id, eventType, payload) => events.push({ eventType, payload })) } as unknown as OutboxService,
    );
  });

  it('completes a delivered, paid order with an audit row and an OrderCompleted event', async () => {
    const result = await service.reconcile(tx, 'order-1', { type: 'SYSTEM' });

    expect(result).toBe(OrderStatus.COMPLETED);
    expect(statusWrites).toEqual([{ id: 'order-1', status: OrderStatus.COMPLETED }]);
    expect(audits).toEqual([
      expect.objectContaining({
        distributorId: 'dist-1',
        entityType: 'ORDER',
        entityId: 'order-1',
        action: 'ORDER_COMPLETED',
        actorType: 'SYSTEM',
        summary: 'Order completed — delivered and paid',
      }),
    ]);
    expect(events).toEqual([
      {
        eventType: ORDER_COMPLETED,
        payload: expect.objectContaining({ orderId: 'order-1', distributorId: 'dist-1', traderCustomerId: 'cust-1', status: OrderStatus.COMPLETED }),
      },
    ]);
  });

  it('reopens a completed order whose payment was reversed', async () => {
    orderRow.status = OrderStatus.COMPLETED;
    orderRow.invoiceExports = [{ ...paidInvoice, invoiceState: 'AWAITING_PAYMENT', amountPaid: new Prisma.Decimal('0'), amountDue: new Prisma.Decimal('120') }];

    const result = await service.reconcile(tx, 'order-1', { type: 'USER', userId: 'user-1', name: 'Pat' });

    expect(result).toBe(OrderStatus.DELIVERED);
    expect(audits[0]).toMatchObject({
      action: 'ORDER_COMPLETION_REVERSED',
      actorType: 'USER',
      actorUserId: 'user-1',
      actorName: 'Pat',
      summary: 'Order reopened — invoice INV-0001 is no longer paid',
    });
    expect(events[0].eventType).toBe(ORDER_COMPLETION_REVERSED);
  });

  it('does not complete a delivered order whose invoice is not paid', async () => {
    orderRow.invoiceExports = [{ ...paidInvoice, invoiceState: 'AWAITING_PAYMENT', amountDue: new Prisma.Decimal('120') }];

    expect(await service.reconcile(tx, 'order-1', { type: 'SYSTEM' })).toBeNull();
    expect(statusWrites).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('does not complete a delivered order with no exported invoice', async () => {
    orderRow.invoiceExports = [];

    expect(await service.reconcile(tx, 'order-1', { type: 'SYSTEM' })).toBeNull();
  });

  it('ignores payment facts on an export that has not completed', async () => {
    orderRow.invoiceExports = [{ ...paidInvoice, status: 'FAILED' }];

    expect(await service.reconcile(tx, 'order-1', { type: 'SYSTEM' })).toBeNull();
  });

  it('does not complete an order that has not been delivered, even if paid', async () => {
    orderRow.status = OrderStatus.ACCEPTED;

    expect(await service.reconcile(tx, 'order-1', { type: 'SYSTEM' })).toBeNull();
    expect(statusWrites).toHaveLength(0);
  });
});
