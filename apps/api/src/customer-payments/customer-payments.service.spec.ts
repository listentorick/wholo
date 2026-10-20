import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccountingInvoiceState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingSyncService } from '../accounting/sync/accounting-sync.service';
import { AccountingConnectionService } from '../accounting/accounting-connection.service';
import { CustomerPaymentsService } from './customer-payments.service';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date('2026-10-17T12:00:00Z');

const openRow = (orderId: string, amountDue: string, dueDate: string) => ({
  orderId,
  externalInvoiceNumber: `INV-${orderId}`,
  invoiceState: AccountingInvoiceState.AWAITING_PAYMENT,
  invoiceTotal: amountDue,
  amountPaid: '0',
  amountCredited: '0',
  amountDue,
  dueDate: d(dueDate),
  order: { orderNumber: `ORD-${orderId}`, currency: 'GBP', traderCustomerId: 'cust-1' },
});

describe('CustomerPaymentsService', () => {
  let service: CustomerPaymentsService;
  let prisma: {
    tradeRelationship: { findUnique: jest.Mock };
    distributorSettings: { findUnique: jest.Mock };
    accountingInvoiceExport: { findMany: jest.Mock };
    invoiceAnalyticsState: { findMany: jest.Mock };
    order: { findMany: jest.Mock };
    orderAnalyticsState: { findMany: jest.Mock };
    invoiceFact: { findMany: jest.Mock; findFirst: jest.Mock };
    accountingConnection: { findFirst: jest.Mock };
  };
  let accountingSync: { getInvoiceSyncStatus: jest.Mock };
  let accountingConnections: { getCurrentConnection: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tradeRelationship: { findUnique: jest.fn().mockResolvedValue({ id: 'rel-1', creditLimit: '5000.00' }) },
      distributorSettings: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/London', currencyCode: 'GBP' }) },
      accountingInvoiceExport: {
        findMany: jest.fn().mockResolvedValue([
          openRow('a', '420.00', '2026-09-11'), // 36 days overdue
          openRow('b', '920.00', '2026-10-20'), // due in 3 days
          openRow('c', '880.00', '2026-11-05'), // due later
        ]),
      },
      invoiceAnalyticsState: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      orderAnalyticsState: { findMany: jest.fn().mockResolvedValue([]) },
      invoiceFact: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      accountingConnection: { findFirst: jest.fn().mockResolvedValue({ connectedAt: d('2026-09-01') }) },
    };
    accountingConnections = { getCurrentConnection: jest.fn().mockResolvedValue(null) };
    accountingSync = {
      getInvoiceSyncStatus: jest.fn().mockResolvedValue({ connected: true, lastSyncedAt: '2026-10-17T11:45:00.000Z' }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomerPaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingSyncService, useValue: accountingSync },
        { provide: AccountingConnectionService, useValue: accountingConnections },
      ],
    }).compile();
    service = moduleRef.get(CustomerPaymentsService);
  });

  it('describes what is owed, overdue, due this week and the credit used', async () => {
    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.asOf).toBe('2026-10-17');
    expect(summary.outstanding).toEqual({ amounts: [{ currency: 'GBP', amount: 2220 }], count: 3, orderCount: 3 });
    expect(summary.overdue.ageing.find((b) => b.bucket === '31-60')).toEqual({
      bucket: '31-60',
      amounts: [{ currency: 'GBP', amount: 420 }],
      count: 1,
    });
    expect(summary.overdue.oldest).toMatchObject({ externalInvoiceNumber: 'INV-a', daysOverdue: 36, amountDue: 420 });
    expect(summary.dueNext7Days).toEqual({ amounts: [{ currency: 'GBP', amount: 920 }], count: 1 });
    expect(summary.credit).toEqual({
      limit: { currency: 'GBP', amount: 5000 },
      used: { currency: 'GBP', amount: 2220 },
      available: { currency: 'GBP', amount: 2780 },
      usedPercent: 44,
      overLimit: false,
    });
    expect(summary.accountingSync).toEqual({ connected: true, lastSyncedAt: '2026-10-17T11:45:00.000Z' });
  });

  it('measures the last 90 days and compares them with the 90 days before', async () => {
    const paid = (dueDate: string, paidOn: string) => ({ orderId: `o-${paidOn}`, issueDate: null, dueDate: d(dueDate), fullyPaidOn: d(paidOn) });
    prisma.invoiceAnalyticsState.findMany.mockResolvedValue([
      // Last 90 days: paid 1, 2 and 3 days late.
      paid('2026-09-01', '2026-09-02'),
      paid('2026-09-01', '2026-09-03'),
      paid('2026-09-01', '2026-09-04'),
      // The 90 days before: paid 10 days late each time.
      paid('2026-06-01', '2026-06-11'),
      paid('2026-06-01', '2026-06-11'),
      paid('2026-06-01', '2026-06-11'),
    ]);

    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.last90Days).toMatchObject({ paidCount: 3, averageDaysLate: 2, paidOnTimePercent: 0, trend: 'improving' });
  });

  it('puts unpaid invoices and those paid in the last 90 days on one timeline', async () => {
    prisma.invoiceAnalyticsState.findMany.mockResolvedValue([
      { orderId: 'o-1', currency: 'GBP', total: '310.00', issueDate: null, dueDate: d('2026-09-20'), fullyPaidOn: d('2026-09-18') },
      { orderId: 'o-old', currency: 'GBP', total: '99.00', issueDate: null, dueDate: d('2026-06-01'), fullyPaidOn: d('2026-06-11') }, // before the window
    ]);
    prisma.order.findMany.mockResolvedValue([
      { id: 'o-1', orderNumber: 'ORD-1' },
      { id: 'a', orderNumber: 'ORD-a' },
    ]);
    prisma.orderAnalyticsState.findMany.mockResolvedValue([
      { orderId: 'o-1', distributorLocalDate: d('2026-08-21') },
      { orderId: 'a', distributorLocalDate: d('2026-08-12') },
    ]);

    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.invoiceTimeline).toEqual([
      { orderId: 'a', orderNumber: 'ORD-a', orderedOn: '2026-08-12', dueDate: '2026-09-11', paidOn: null, daysLate: 36, currency: 'GBP', total: 420, amountDue: 420 },
      { orderId: 'o-1', orderNumber: 'ORD-1', orderedOn: '2026-08-21', dueDate: '2026-09-20', paidOn: '2026-09-18', daysLate: 0, currency: 'GBP', total: 310, amountDue: 0 },
      { orderId: 'b', orderNumber: 'ORD-b', orderedOn: null, dueDate: '2026-10-20', paidOn: null, daysLate: 0, currency: 'GBP', total: 920, amountDue: 920 },
      { orderId: 'c', orderNumber: 'ORD-c', orderedOn: null, dueDate: '2026-11-05', paidOn: null, daysLate: 0, currency: 'GBP', total: 880, amountDue: 880 },
    ]);
  });

  it("rebuilds what was overdue each day from the customer's invoice facts, from the day facts began", async () => {
    prisma.invoiceFact.findFirst.mockResolvedValue({ distributorLocalDate: d('2026-10-15') });
    prisma.invoiceFact.findMany.mockResolvedValue([
      {
        exportId: 'exp-a',
        invoiceState: 'AWAITING_PAYMENT',
        currency: 'GBP',
        amountDue: '420.00',
        dueDate: d('2026-09-11'),
        distributorLocalDate: d('2026-10-15'),
        occurredAt: new Date('2026-10-15T10:00:00Z'),
      },
    ]);

    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.overdueHistory).toEqual({
      currency: 'GBP',
      since: '2026-10-15',
      days: [
        { date: '2026-10-15', buckets: { '1-30': 0, '31-60': 420, '61-90': 0, '90+': 0 } },
        { date: '2026-10-16', buckets: { '1-30': 0, '31-60': 420, '61-90': 0, '90+': 0 } },
        { date: '2026-10-17', buckets: { '1-30': 0, '31-60': 420, '61-90': 0, '90+': 0 } },
      ],
    });
  });

  it('has not enough history for a trend with nothing paid before', async () => {
    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.last90Days).toMatchObject({ paidCount: 0, averageDaysLate: null, trend: 'insufficient_history' });
  });

  it('counts accepted orders the accounting system has not invoiced yet', async () => {
    accountingConnections.getCurrentConnection.mockResolvedValue({ accountingOrganisationId: 'acc-org-1', connectedAt: d('2026-10-01') });
    prisma.order.findMany.mockResolvedValue([
      { currency: 'GBP', totalAmount: '240.00' },
      { currency: 'GBP', totalAmount: '60.00' },
    ]);

    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.notYetInvoiced).toEqual({ amounts: [{ currency: 'GBP', amount: 300 }], count: 2 });
  });

  it('has no orders waiting to be invoiced without an accounting connection', async () => {
    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.notYetInvoiced).toEqual({ amounts: [], count: 0 });
  });

  it('has no credit limit when none is set', async () => {
    prisma.tradeRelationship.findUnique.mockResolvedValue({ id: 'rel-1', creditLimit: null });

    const summary = await service.getSummary('dist-1', 'cust-1', NOW);

    expect(summary.credit).toMatchObject({ limit: null, available: null, usedPercent: null });
  });

  it('is not found for someone who is not this distributor’s customer', async () => {
    prisma.tradeRelationship.findUnique.mockResolvedValue(null);

    await expect(service.getSummary('dist-1', 'stranger', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
