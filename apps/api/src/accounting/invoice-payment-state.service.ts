import { Injectable } from '@nestjs/common';
import { AccountingInvoiceExport, AccountingInvoiceState, Prisma } from '@prisma/client';
import { AuditActor, AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { OrderCompletionService } from '../orders/order-completion.service';
import {
  derivePaymentStatus,
  INVOICE_PAYMENT_STATUS_CHANGED,
  InvoicePaymentStatus,
  paymentStatusSummary,
} from './invoice-payment-status';

export type ExportWithOrder = AccountingInvoiceExport & { order: { traderCustomerId: string; currency: string } };

// The payment columns of an AccountingInvoiceExport, as the accounting system
// now reports them.
export interface SyncedState {
  invoiceState: AccountingInvoiceState;
  invoiceTotal: string;
  amountPaid: string;
  amountCredited: string;
  amountDue: string;
  issueDate: Date | null;
  dueDate: Date | null;
  fullyPaidOn: Date | null;
  providerUpdatedAt: Date | null;
  externalInvoiceNumber: string | null;
  externalInvoiceStatus: string;
}

function sameAmount(a: Prisma.Decimal | null, b: string): boolean {
  return a !== null && Number(a.toString()).toFixed(2) === Number(b).toFixed(2);
}

function sameDate(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// Whether anything Stocdup shows or derives from has moved.
export function syncedStateChanged(current: AccountingInvoiceExport, next: SyncedState): boolean {
  return (
    current.invoiceState !== next.invoiceState ||
    !sameAmount(current.invoiceTotal, next.invoiceTotal) ||
    !sameAmount(current.amountPaid, next.amountPaid) ||
    !sameAmount(current.amountCredited, next.amountCredited) ||
    !sameAmount(current.amountDue, next.amountDue) ||
    !sameDate(current.issueDate, next.issueDate) ||
    !sameDate(current.dueDate, next.dueDate) ||
    !sameDate(current.fullyPaidOn, next.fullyPaidOn) ||
    (next.externalInvoiceNumber !== null && current.externalInvoiceNumber !== next.externalInvoiceNumber) ||
    current.externalInvoiceStatus !== next.externalInvoiceStatus
  );
}

export interface PaymentStateContext {
  // Where the change came from, as shown on the timeline (the provider today).
  source: string;
  // Invoice currency if the source reports it; falls back to the order's.
  currency?: string | null;
  actor: AuditActor;
}

export interface PaymentStateResult {
  changed: boolean;
  fromStatus: InvoicePaymentStatus;
  toStatus: InvoicePaymentStatus;
}

// The only code that writes an invoice's payment columns (enforced by an
// ESLint rule). Every derived payment-status change (Unpaid → Part paid →
// Paid, Void) writes, in the caller's transaction and together:
//   - the InvoicePaymentStatusChanged outbox event (invoice facts, ADR-072),
//   - an audit row on the order (the order timeline),
//   - the order's COMPLETED reconciliation (OrderCompletionService).
// Whatever changes payment state — the accounting status sync today, a
// manual "mark as paid" later — goes through here so none of those is skipped.
@Injectable()
export class InvoicePaymentStateService {
  constructor(
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly orderCompletion: OrderCompletionService,
  ) {}

  async apply(
    tx: Prisma.TransactionClient,
    current: ExportWithOrder,
    next: SyncedState,
    ctx: PaymentStateContext,
  ): Promise<PaymentStateResult> {
    const fromStatus = derivePaymentStatus(current);
    const toStatus = derivePaymentStatus(next);
    if (!syncedStateChanged(current, next)) return { changed: false, fromStatus, toStatus };

    await this.orderCompletion.lockOrder(tx, current.orderId);
    await tx.accountingInvoiceExport.update({
      where: { id: current.id },
      data: {
        invoiceState: next.invoiceState,
        invoiceTotal: next.invoiceTotal,
        amountPaid: next.amountPaid,
        amountCredited: next.amountCredited,
        amountDue: next.amountDue,
        issueDate: next.issueDate,
        dueDate: next.dueDate,
        fullyPaidOn: next.fullyPaidOn,
        providerUpdatedAt: next.providerUpdatedAt,
        externalInvoiceStatus: next.externalInvoiceStatus,
        ...(next.externalInvoiceNumber ? { externalInvoiceNumber: next.externalInvoiceNumber } : {}),
        stateSyncedAt: new Date(),
      },
    });
    if (fromStatus === toStatus) return { changed: true, fromStatus, toStatus };

    const currency = ctx.currency ?? current.order.currency;
    await this.outbox.writeEvent(tx, 'AccountingInvoiceExport', current.id, INVOICE_PAYMENT_STATUS_CHANGED, {
      exportId: current.id,
      orderId: current.orderId,
      distributorId: current.distributorId,
      customerId: current.order.traderCustomerId,
      provider: current.provider,
      fromStatus,
      toStatus,
      invoiceState: next.invoiceState,
      currency,
      total: next.invoiceTotal,
      amountPaid: next.amountPaid,
      amountCredited: next.amountCredited,
      amountDue: next.amountDue,
      issueDate: isoDate(next.issueDate),
      dueDate: isoDate(next.dueDate),
      fullyPaidOn: isoDate(next.fullyPaidOn),
      occurredAt: (next.providerUpdatedAt ?? new Date()).toISOString(),
    });
    await this.audit.record(tx, {
      distributorId: current.distributorId,
      entityType: 'ORDER',
      entityId: current.orderId,
      action: 'INVOICE_PAYMENT_STATUS_CHANGED',
      actorType: ctx.actor.type,
      actorUserId: ctx.actor.userId,
      actorName: ctx.actor.name,
      summary: paymentStatusSummary(fromStatus, toStatus, {
        invoiceRef: next.externalInvoiceNumber ?? current.externalInvoiceNumber ?? current.externalInvoiceId,
        source: ctx.source,
        amountDue: next.amountDue,
        currency,
      }),
      changes: { exportId: current.id, fromStatus, toStatus, amountPaid: next.amountPaid, amountDue: next.amountDue, currency },
    });
    await this.orderCompletion.reconcile(tx, current.orderId, ctx.actor);
    return { changed: true, fromStatus, toStatus };
  }
}
