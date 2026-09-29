import { AccountingInvoiceState } from '@prisma/client';
import { summariseOpen, summarisePaid, toOpenInvoice } from './customer-payments.logic';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('toOpenInvoice', () => {
  const row = {
    orderId: 'o-1',
    externalInvoiceNumber: 'INV-1',
    order: { orderNumber: 'ORD-1', currency: 'GBP' },
    invoiceState: AccountingInvoiceState.AWAITING_PAYMENT,
    invoiceTotal: '120.00',
    amountPaid: '20.00',
    amountCredited: '0',
    amountDue: '100.00',
    dueDate: d('2026-09-01'),
  };

  it('describes an overdue part-paid invoice, counting whole days late', () => {
    expect(toOpenInvoice(row, '2026-09-11')).toEqual({
      orderId: 'o-1',
      orderNumber: 'ORD-1',
      externalInvoiceNumber: 'INV-1',
      currency: 'GBP',
      total: 120,
      amountDue: 100,
      dueDate: '2026-09-01',
      paymentStatus: 'PART_PAID',
      isOverdue: true,
      daysOverdue: 10,
    });
  });

  it('is not overdue on its due date', () => {
    expect(toOpenInvoice(row, '2026-09-01')).toMatchObject({ isOverdue: false, daysOverdue: 0 });
  });
});

describe('summarisePaid', () => {
  it('averages days to pay and the share paid by the due date', () => {
    expect(
      summarisePaid([
        { issueDate: d('2026-08-01'), dueDate: d('2026-08-31'), fullyPaidOn: d('2026-08-21') }, // 20 days, on time
        { issueDate: d('2026-08-01'), dueDate: d('2026-08-31'), fullyPaidOn: d('2026-09-10') }, // 40 days, late
      ]),
    ).toEqual({ paidCount: 2, averageDaysToPay: 30, paidOnTimePercent: 50 });
  });

  it('has no averages with nothing paid — never a misleading 0', () => {
    expect(summarisePaid([])).toEqual({ paidCount: 0, averageDaysToPay: null, paidOnTimePercent: null });
  });

  it('leaves an invoice out of a measure it lacks the dates for', () => {
    expect(summarisePaid([{ issueDate: null, dueDate: d('2026-08-31'), fullyPaidOn: d('2026-08-20') }])).toEqual({
      paidCount: 1,
      averageDaysToPay: null,
      paidOnTimePercent: 100,
    });
  });
});

describe('summariseOpen', () => {
  it('totals what is outstanding and what is overdue', () => {
    const inv = (amountDue: number, isOverdue: boolean, daysOverdue: number) =>
      ({ amountDue, isOverdue, daysOverdue }) as Parameters<typeof summariseOpen>[0][number];
    expect(summariseOpen([inv(100, true, 12), inv(50.25, true, 3), inv(80, false, 0)])).toEqual({
      outstanding: { amount: 230.25, count: 3 },
      overdue: { amount: 150.25, count: 2, oldestDaysOverdue: 12 },
    });
  });
});
