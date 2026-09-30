import { Injectable } from '@nestjs/common';
import { AccountingInvoiceExportStatus, OrderStatus, Prisma } from '@prisma/client';
import { AuditActor, AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { derivePaymentStatus, InvoicePaymentStatus } from '../accounting/invoice-payment-status';

export const ORDER_COMPLETED = 'OrderCompleted';
export const ORDER_COMPLETION_REVERSED = 'OrderCompletionReversed';

// COMPLETED means delivered *and* paid (Delivered alone means "we kept our end
// of the bargain"). Whichever of the two happens second completes the order;
// a payment reversed in the accounting system takes it back to DELIVERED.
// Returns the status the order should move to, or null for no change.
export function resolveCompletion(orderStatus: OrderStatus, paymentStatus: InvoicePaymentStatus): OrderStatus | null {
  if (orderStatus === OrderStatus.DELIVERED && paymentStatus === 'PAID') return OrderStatus.COMPLETED;
  if (orderStatus === OrderStatus.COMPLETED && paymentStatus !== 'PAID') return OrderStatus.DELIVERED;
  return null;
}

// The only code that moves an order into or out of COMPLETED. Callers are the
// two things COMPLETED depends on: delivery confirmation and invoice payment
// state (InvoicePaymentStateService). Every move writes an audit row and an
// outbox event in the caller's transaction.
@Injectable()
export class OrderCompletionService {
  constructor(
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // Takes the order's row lock. Delivery confirmation and payment sync run in
  // separate transactions and each reads what the other writes; both lock the
  // order row before touching anything, so whichever runs second waits for
  // the first to commit and sees its writes (otherwise both could miss each
  // other and leave the order DELIVERED + PAID).
  async lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await tx.order.update({ where: { id: orderId }, data: { updatedAt: new Date() } });
  }

  async reconcile(tx: Prisma.TransactionClient, orderId: string, actor: AuditActor): Promise<OrderStatus | null> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        distributorId: true,
        traderCustomerId: true,
        status: true,
        // Latest export only — same rule as the order read models.
        invoiceExports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            externalInvoiceId: true,
            externalInvoiceNumber: true,
            invoiceState: true,
            invoiceTotal: true,
            amountPaid: true,
            amountCredited: true,
            amountDue: true,
          },
        },
      },
    });
    const invoice = order.invoiceExports[0];
    const paymentStatus: InvoicePaymentStatus =
      invoice && invoice.status === AccountingInvoiceExportStatus.COMPLETED ? derivePaymentStatus(invoice) : 'NOT_SYNCED';

    const next = resolveCompletion(order.status, paymentStatus);
    if (!next) return null;

    const completed = next === OrderStatus.COMPLETED;
    const invoiceRef = invoice?.externalInvoiceNumber ?? invoice?.externalInvoiceId ?? null;
    await tx.order.update({ where: { id: order.id }, data: { status: next } });
    await this.audit.record(tx, {
      distributorId: order.distributorId,
      entityType: 'ORDER',
      entityId: order.id,
      action: completed ? 'ORDER_COMPLETED' : 'ORDER_COMPLETION_REVERSED',
      actorType: actor.type,
      actorUserId: actor.userId,
      actorName: actor.name,
      summary: completed
        ? 'Order completed — delivered and paid'
        : `Order reopened — invoice${invoiceRef ? ` ${invoiceRef}` : ''} is no longer paid`,
      changes: { from: order.status, to: next, paymentStatus },
    });
    await this.outbox.writeEvent(tx, 'Order', order.id, completed ? ORDER_COMPLETED : ORDER_COMPLETION_REVERSED, {
      orderId: order.id,
      distributorId: order.distributorId,
      traderCustomerId: order.traderCustomerId,
      status: next,
      occurredAt: new Date().toISOString(),
    });
    return next;
  }
}
