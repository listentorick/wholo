import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountingInvoiceExportStatus, AccountingInvoiceState, InvoicePaymentStatus, OrderStatus } from '@prisma/client';
import type { CustomerOpenInvoice, CustomerPaymentSummary } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { AccountingSyncService } from '../accounting/sync/accounting-sync.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import {
  creditPosition,
  OpenInvoiceRow,
  invoiceTimeline,
  paymentTrend,
  sumDueWithin,
  summariseOpen,
  sumNotYetInvoiced,
  summarisePaid,
  TimelineOrder,
  toOpenInvoice,
  overdueHistory,
} from './customer-payments.logic';

const HISTORY_DAYS = 90;
const DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATES: AccountingInvoiceState[] = [
  AccountingInvoiceState.DRAFT,
  AccountingInvoiceState.AWAITING_APPROVAL,
  AccountingInvoiceState.AWAITING_PAYMENT,
];
// Accepted and not cancelled: the accounting export invoices these (on OrderAccepted).
const INVOICEABLE_ORDER_STATUSES: OrderStatus[] = [OrderStatus.ACCEPTED, OrderStatus.COMPLETED, OrderStatus.DELIVERED];

// Customer payment position (ADR-072). "Right now" figures (outstanding,
// overdue, the open-invoice list) are live queries on the synced
// AccountingInvoiceExport rows; "how they pay" comes from
// invoice_analytics_state (the facts), per the stats taxonomy.
// Orders not yet invoiced are a live query on orders and their exports.
// Everything is scoped by distributorId: a customer shared by two
// distributors has separate invoices and history with each.
@Injectable()
export class CustomerPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingSync: AccountingSyncService,
    private readonly accountingConnections: AccountingConnectionService,
  ) {}

  async localToday(distributorId: string, now: Date = new Date()): Promise<string> {
    const settings = await this.prisma.distributorSettings.findUnique({ where: { distributorId }, select: { timezone: true } });
    return distributorLocalDate(now, settings?.timezone ?? 'UTC').toISOString().slice(0, 10);
  }

  // Unsettled invoices (never PAID / VOIDED / DELETED) — optionally for one
  // customer. Shared with the customer health dashboard.
  async openInvoices(distributorId: string, today: string, customerId?: string): Promise<Array<CustomerOpenInvoice & { customerId: string }>> {
    const rows = await this.prisma.accountingInvoiceExport.findMany({
      where: {
        distributorId,
        status: AccountingInvoiceExportStatus.COMPLETED,
        externalInvoiceId: { not: null },
        invoiceState: { in: OPEN_STATES },
        ...(customerId ? { order: { traderCustomerId: customerId } } : {}),
      },
      include: { order: { select: { orderNumber: true, currency: true, traderCustomerId: true } } },
      orderBy: { dueDate: 'asc' },
    });
    return rows.map((row) => ({
      ...toOpenInvoice(row as OpenInvoiceRow, today),
      customerId: row.order.traderCustomerId,
    }));
  }

  // Order number and order date (the distributor-local date the order
  // analytics use) for each invoice on the invoice timeline.
  private async timelineOrders(distributorId: string, orderIds: string[]): Promise<Map<string, TimelineOrder>> {
    if (orderIds.length === 0) return new Map();
    const [orders, states] = await Promise.all([
      this.prisma.order.findMany({ where: { id: { in: orderIds }, distributorId }, select: { id: true, orderNumber: true } }),
      this.prisma.orderAnalyticsState.findMany({
        where: { orderId: { in: orderIds }, distributorId },
        select: { orderId: true, distributorLocalDate: true },
      }),
    ]);
    const orderedOn = new Map(states.map((s) => [s.orderId, s.distributorLocalDate]));
    return new Map(orders.map((o) => [o.id, { orderNumber: o.orderNumber, orderedOn: orderedOn.get(o.id) ?? null }]));
  }

  // Orders accepted since this accounting organisation was first connected
  // that it has no invoice for yet. Orders from before the connection were
  // never going to be invoiced, so they are not counted.
  private async notYetInvoiced(distributorId: string, customerId: string): Promise<CustomerPaymentSummary['notYetInvoiced']> {
    const connection = await this.accountingConnections.getCurrentConnection(distributorId);
    if (!connection) return sumNotYetInvoiced([]);
    const first = await this.prisma.accountingConnection.findFirst({
      where: { distributorId, accountingOrganisationId: connection.accountingOrganisationId },
      orderBy: { connectedAt: 'asc' },
      select: { connectedAt: true },
    });
    const orders = await this.prisma.order.findMany({
      where: {
        distributorId,
        traderCustomerId: customerId,
        status: { in: INVOICEABLE_ORDER_STATUSES },
        acceptedAt: { gte: first?.connectedAt ?? connection.connectedAt },
        invoiceExports: { none: { status: AccountingInvoiceExportStatus.COMPLETED, externalInvoiceId: { not: null } } },
      },
      select: { currency: true, totalAmount: true },
    });
    return sumNotYetInvoiced(orders);
  }

  async getSummary(distributorId: string, customerId: string, now: Date = new Date()): Promise<CustomerPaymentSummary> {
    const relationship = await this.prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId, customerId } },
      select: { id: true, creditLimit: true },
    });
    if (!relationship) throw new NotFoundException('Customer not found');

    const [today, settings] = await Promise.all([
      this.localToday(distributorId, now),
      this.prisma.distributorSettings.findUnique({ where: { distributorId }, select: { currencyCode: true } }),
    ]);
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const since = new Date(todayMs - HISTORY_DAYS * DAY_MS);
    // The 90 days before `since`, for the payment trend.
    const previousSince = new Date(todayMs - 2 * HISTORY_DAYS * DAY_MS);
    const [open, paid, accountingSync, facts, firstFact, notYetInvoiced] = await Promise.all([
      this.openInvoices(distributorId, today, customerId),
      this.prisma.invoiceAnalyticsState.findMany({
        where: { distributorId, customerId, status: InvoicePaymentStatus.PAID, fullyPaidOn: { gte: previousSince } },
        select: { orderId: true, currency: true, total: true, issueDate: true, dueDate: true, fullyPaidOn: true },
      }),
      this.accountingSync.getInvoiceSyncStatus(distributorId),
      // Every fact for this customer up to today: an invoice raised long ago can still be overdue in the window.
      this.prisma.invoiceFact.findMany({
        where: { distributorId, customerId, distributorLocalDate: { lte: new Date(todayMs) } },
        select: {
          exportId: true,
          invoiceState: true,
          currency: true,
          amountDue: true,
          dueDate: true,
          distributorLocalDate: true,
          occurredAt: true,
        },
      }),
      // When this distributor's facts began: history before that is unknown, not zero.
      this.prisma.invoiceFact.findFirst({
        where: { distributorId },
        orderBy: { distributorLocalDate: 'asc' },
        select: { distributorLocalDate: true },
      }),
      this.notYetInvoiced(distributorId, customerId),
    ]);

    const openInvoices = open.map(({ customerId: _customerId, ...invoice }) => invoice);
    const current = paid.filter((r) => r.fullyPaidOn! >= since);
    const previous = paid.filter((r) => r.fullyPaidOn! < since);
    const currency = settings?.currencyCode ?? 'GBP';
    const orders = await this.timelineOrders(distributorId, [...current.map((r) => r.orderId), ...openInvoices.map((i) => i.orderId)]);
    return {
      customerId,
      asOf: today,
      ...summariseOpen(openInvoices),
      dueNext7Days: sumDueWithin(openInvoices, today, DUE_SOON_DAYS),
      credit: creditPosition(relationship.creditLimit, currency, openInvoices),
      last90Days: { ...summarisePaid(current), trend: paymentTrend(current, previous) },
      invoiceTimeline: invoiceTimeline(current, openInvoices, orders),
      overdueHistory: overdueHistory(facts, today, currency, firstFact?.distributorLocalDate ?? null),
      notYetInvoiced,
      accountingSync,
      openInvoices,
    };
  }
}
