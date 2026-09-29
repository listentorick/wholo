import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountingInvoiceExportStatus, AccountingInvoiceState, InvoicePaymentStatus } from '@prisma/client';
import type { CustomerOpenInvoice, CustomerPaymentSummary } from '@wholo/types';
import { PrismaService } from '../prisma/prisma.service';
import { distributorLocalDate } from '../common/distributor-local-date';
import { OpenInvoiceRow, summariseOpen, summarisePaid, toOpenInvoice } from './customer-payments.logic';

const HISTORY_DAYS = 90;
const OPEN_STATES: AccountingInvoiceState[] = [
  AccountingInvoiceState.DRAFT,
  AccountingInvoiceState.AWAITING_APPROVAL,
  AccountingInvoiceState.AWAITING_PAYMENT,
];

// Customer payment position (ADR-072). "Right now" figures (outstanding,
// overdue, the open-invoice list) are live queries on the synced
// AccountingInvoiceExport rows; "how they pay" comes from
// invoice_analytics_state (the facts), per the stats taxonomy.
// Everything is scoped by distributorId: a customer shared by two
// distributors has separate invoices and history with each.
@Injectable()
export class CustomerPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getSummary(distributorId: string, customerId: string, now: Date = new Date()): Promise<CustomerPaymentSummary> {
    const relationship = await this.prisma.tradeRelationship.findUnique({
      where: { distributorId_customerId: { distributorId, customerId } },
      select: { id: true },
    });
    if (!relationship) throw new NotFoundException('Customer not found');

    const today = await this.localToday(distributorId, now);
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const [open, paid] = await Promise.all([
      this.openInvoices(distributorId, today, customerId),
      this.prisma.invoiceAnalyticsState.findMany({
        where: { distributorId, customerId, status: InvoicePaymentStatus.PAID, fullyPaidOn: { gte: since } },
        select: { issueDate: true, dueDate: true, fullyPaidOn: true },
      }),
    ]);

    const openInvoices = open.map(({ customerId: _customerId, ...invoice }) => invoice);
    return {
      customerId,
      asOf: today,
      ...summariseOpen(openInvoices),
      last90Days: summarisePaid(paid),
      openInvoices,
    };
  }
}
