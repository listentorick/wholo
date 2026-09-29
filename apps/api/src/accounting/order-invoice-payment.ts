import { AccountingInvoiceExportStatus, AccountingInvoiceState, Prisma } from '@prisma/client';
import type { OrderInvoicePayment, OrderPaymentFilter } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { derivePaymentStatus, InvoicePaymentFacts, isOverdue } from './invoice-payment-status';

// The export columns an order read model needs to describe payment (ADR-072).
export const invoicePaymentSelect = {
  status: true,
  externalInvoiceNumber: true,
  invoiceState: true,
  invoiceTotal: true,
  amountPaid: true,
  amountCredited: true,
  amountDue: true,
  dueDate: true,
  fullyPaidOn: true,
} satisfies Prisma.AccountingInvoiceExportSelect;

type InvoicePaymentRow = InvoicePaymentFacts & {
  status: AccountingInvoiceExportStatus;
  externalInvoiceNumber: string | null;
  fullyPaidOn: Date | null;
};

const money = (v: { toString(): string } | null | undefined) => (v == null ? 0 : Math.round(Number(v.toString()) * 100) / 100);
const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

// Null until the invoice exists in the accounting system and the status sync
// has seen it — the UI then shows no payment badge at all.
export function toOrderInvoicePayment(row: InvoicePaymentRow | undefined, today: string): OrderInvoicePayment | null {
  if (!row || row.status !== AccountingInvoiceExportStatus.COMPLETED || !row.invoiceState) return null;
  return {
    paymentStatus: derivePaymentStatus(row),
    isOverdue: isOverdue(row, today),
    externalInvoiceNumber: row.externalInvoiceNumber,
    total: money(row.invoiceTotal),
    amountPaid: money(row.amountPaid),
    amountDue: money(row.amountDue),
    dueDate: isoDate(row.dueDate),
    fullyPaidOn: isoDate(row.fullyPaidOn),
  };
}

// Each distributor's local "today" (YYYY-MM-DD) — what "overdue" is measured against.
export async function distributorTodays(prisma: PrismaService, distributorIds: string[], now: Date = new Date()): Promise<Map<string, string>> {
  const ids = [...new Set(distributorIds)];
  const settings = ids.length
    ? await prisma.distributorSettings.findMany({ where: { distributorId: { in: ids } }, select: { distributorId: true, timezone: true } })
    : [];
  const tz = new Map(settings.map((s) => [s.distributorId, s.timezone]));
  return new Map(ids.map((id) => [id, distributorLocalDate(now, tz.get(id) ?? 'UTC').toISOString().slice(0, 10)]));
}

const OPEN: AccountingInvoiceState[] = [
  AccountingInvoiceState.DRAFT,
  AccountingInvoiceState.AWAITING_APPROVAL,
  AccountingInvoiceState.AWAITING_PAYMENT,
];

// Order-list filter on payment position — the same definitions as
// derivePaymentStatus / isOverdue, expressed as a query.
export function paymentFilterWhere(filter: OrderPaymentFilter, today: string): Prisma.OrderWhereInput {
  const completed = { status: AccountingInvoiceExportStatus.COMPLETED };
  switch (filter) {
    case 'PAID':
      return {
        invoiceExports: {
          some: {
            ...completed,
            OR: [
              { invoiceState: AccountingInvoiceState.PAID },
              { invoiceState: AccountingInvoiceState.AWAITING_PAYMENT, amountDue: { lte: 0 }, invoiceTotal: { gt: 0 } },
            ],
          },
        },
      };
    case 'PART_PAID':
      return {
        invoiceExports: {
          some: {
            ...completed,
            invoiceState: { in: OPEN },
            amountDue: { gt: 0 },
            OR: [{ amountPaid: { gt: 0 } }, { amountCredited: { gt: 0 } }],
          },
        },
      };
    case 'UNPAID':
      return {
        invoiceExports: {
          some: {
            ...completed,
            invoiceState: { in: OPEN },
            amountPaid: { lte: 0 },
            amountCredited: { lte: 0 },
            NOT: { invoiceState: AccountingInvoiceState.AWAITING_PAYMENT, amountDue: { lte: 0 }, invoiceTotal: { gt: 0 } },
          },
        },
      };
    case 'OVERDUE':
      return {
        invoiceExports: {
          some: {
            ...completed,
            invoiceState: AccountingInvoiceState.AWAITING_PAYMENT,
            amountDue: { gt: 0 },
            dueDate: { lt: new Date(`${today}T00:00:00.000Z`) },
          },
        },
      };
  }
}
