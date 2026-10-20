import { AccountingInvoiceState } from '@prisma/client';
import {
  invoiceTimeline,
  overdueHistory,
  OVERDUE_HISTORY_DAYS,
  type OverdueFactRow,
  ageOverdue,
  creditPosition,
  oldestOverdue,
  paymentTrend,
  sumDueWithin,
  summariseOpen,
  summarisePaid,
  sumNotYetInvoiced,
  toOpenInvoice,
} from './customer-payments.logic';

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
  it('averages the terms given, invoice date to due date, from invoices with both dates only', () => {
    expect(
      summarisePaid([
        { issueDate: d('2026-08-01'), dueDate: d('2026-08-31'), fullyPaidOn: d('2026-09-10') }, // 30 days allowed
        { issueDate: d('2026-08-01'), dueDate: d('2026-09-30'), fullyPaidOn: d('2026-09-10') }, // 60 days allowed
        { issueDate: null, dueDate: d('2026-08-31'), fullyPaidOn: d('2026-09-10') },
        { issueDate: d('2026-08-01'), dueDate: null, fullyPaidOn: d('2026-09-10') },
      ]).averageDaysAllowed,
    ).toBe(45);
  });

  it('averages days to pay and the share paid by the due date', () => {
    expect(
      summarisePaid([
        { issueDate: d('2026-08-01'), dueDate: d('2026-08-31'), fullyPaidOn: d('2026-08-21') }, // 20 days, on time
        { issueDate: d('2026-08-01'), dueDate: d('2026-08-31'), fullyPaidOn: d('2026-09-10') }, // 40 days, late
      ]),
    ).toEqual({ paidCount: 2, averageDaysToPay: 30, averageDaysAllowed: 30, averageDaysLate: 5, paidOnTimePercent: 50 });
  });

  it('has no averages with nothing paid — never a misleading 0', () => {
    expect(summarisePaid([])).toEqual({
      paidCount: 0,
      averageDaysToPay: null,
      averageDaysAllowed: null,
      averageDaysLate: null,
      paidOnTimePercent: null,
    });
  });

  it('leaves an invoice out of a measure it lacks the dates for', () => {
    expect(summarisePaid([{ issueDate: null, dueDate: d('2026-08-31'), fullyPaidOn: d('2026-08-20') }])).toEqual({
      paidCount: 1,
      averageDaysToPay: null,
      averageDaysAllowed: null,
      averageDaysLate: 0,
      paidOnTimePercent: 100,
    });
  });

  it('counts paying early as 0 days late, not as negative days', () => {
    expect(
      summarisePaid([
        { issueDate: null, dueDate: d('2026-08-31'), fullyPaidOn: d('2026-08-11') }, // 20 days early
        { issueDate: null, dueDate: d('2026-08-31'), fullyPaidOn: d('2026-09-12') }, // 12 days late
      ]).averageDaysLate,
    ).toBe(6);
  });
});

describe('paymentTrend', () => {
  // n invoices each paid `late` days after their due date.
  const paidLate = (n: number, late: number) =>
    Array.from({ length: n }, () => ({ issueDate: null, dueDate: d('2026-08-01'), fullyPaidOn: new Date(d('2026-08-01').getTime() + late * 86_400_000) }));

  it('needs at least 3 paid invoices in each period', () => {
    expect(paymentTrend(paidLate(2, 0), paidLate(5, 20))).toBe('insufficient_history');
    expect(paymentTrend(paidLate(5, 0), paidLate(2, 20))).toBe('insufficient_history');
    expect(paymentTrend([], [])).toBe('insufficient_history');
  });

  it('is improving when paying at least 3 days less late than before', () => {
    expect(paymentTrend(paidLate(3, 2), paidLate(3, 5))).toBe('improving');
  });

  it('is worsening when paying at least 3 days later than before', () => {
    expect(paymentTrend(paidLate(3, 8), paidLate(3, 5))).toBe('worsening');
  });

  it('is steady for a smaller change', () => {
    expect(paymentTrend(paidLate(4, 6), paidLate(4, 4))).toBe('steady');
  });

  it('ignores invoices without a due date', () => {
    const noDue = { issueDate: null, dueDate: null, fullyPaidOn: d('2026-08-01') };
    expect(paymentTrend([...paidLate(2, 0), noDue], paidLate(3, 9))).toBe('insufficient_history');
  });
});

const inv = (amountDue: number, isOverdue: boolean, daysOverdue: number, currency = 'GBP', extra: Record<string, unknown> = {}) =>
  ({ orderId: `o-${amountDue}-${daysOverdue}`, amountDue, isOverdue, daysOverdue, currency, ...extra }) as Parameters<typeof summariseOpen>[0][number];

describe('summariseOpen', () => {
  it('totals what is outstanding and what is overdue', () => {
    const summary = summariseOpen([inv(100, true, 12), inv(50.25, true, 3), inv(80, false, 0)]);
    expect(summary.outstanding).toEqual({ amounts: [{ currency: 'GBP', amount: 230.25 }], count: 3, orderCount: 3 });
    expect(summary.overdue).toMatchObject({ amounts: [{ currency: 'GBP', amount: 150.25 }], count: 2, oldestDaysOverdue: 12 });
  });

  it('counts each order once, however many unpaid invoices it has', () => {
    const summary = summariseOpen([inv(10, false, 0, 'GBP', { orderId: 'o-1' }), inv(20, false, 0, 'GBP', { orderId: 'o-1' })]);
    expect(summary.outstanding.orderCount).toBe(1);
  });

  it('never adds amounts in different currencies together', () => {
    const summary = summariseOpen([inv(100, true, 5, 'GBP'), inv(40, false, 0, 'EUR'), inv(10, true, 2, 'EUR')]);
    expect(summary.outstanding.amounts).toEqual([
      { currency: 'EUR', amount: 50 },
      { currency: 'GBP', amount: 100 },
    ]);
    expect(summary.overdue.amounts).toEqual([
      { currency: 'EUR', amount: 10 },
      { currency: 'GBP', amount: 100 },
    ]);
  });

  it('has no amounts at all when nothing is owed (the UI shows zero in the distributor currency)', () => {
    const summary = summariseOpen([]);
    expect(summary.outstanding).toEqual({ amounts: [], count: 0, orderCount: 0 });
    expect(summary.overdue).toMatchObject({ amounts: [], count: 0, oldestDaysOverdue: null, oldest: null });
  });
});

describe('ageOverdue', () => {
  it('puts each overdue invoice in its band, at the band edges too', () => {
    const ageing = ageOverdue([
      inv(1, true, 1),
      inv(2, true, 30),
      inv(4, true, 31),
      inv(8, true, 60),
      inv(16, true, 61),
      inv(32, true, 90),
      inv(64, true, 91),
      inv(128, false, 0), // not overdue: in no band
    ]);
    expect(ageing).toEqual([
      { bucket: '1-30', amounts: [{ currency: 'GBP', amount: 3 }], count: 2 },
      { bucket: '31-60', amounts: [{ currency: 'GBP', amount: 12 }], count: 2 },
      { bucket: '61-90', amounts: [{ currency: 'GBP', amount: 48 }], count: 2 },
      { bucket: '90+', amounts: [{ currency: 'GBP', amount: 64 }], count: 1 },
    ]);
  });

  it('always has all four bands, empty when nothing is overdue', () => {
    expect(ageOverdue([]).map((b) => [b.bucket, b.count, b.amounts])).toEqual([
      ['1-30', 0, []],
      ['31-60', 0, []],
      ['61-90', 0, []],
      ['90+', 0, []],
    ]);
  });
});

describe('oldestOverdue', () => {
  it('is the overdue invoice that has waited longest', () => {
    const oldest = oldestOverdue([
      inv(420, true, 36, 'GBP', { orderId: 'o-a', orderNumber: 'ORD-1', externalInvoiceNumber: 'INV-1042' }),
      inv(460, true, 21),
      inv(900, false, 0),
    ]);
    expect(oldest).toEqual({
      orderId: 'o-a',
      orderNumber: 'ORD-1',
      externalInvoiceNumber: 'INV-1042',
      currency: 'GBP',
      amountDue: 420,
      daysOverdue: 36,
    });
  });

  it('is null when nothing is overdue', () => {
    expect(oldestOverdue([inv(10, false, 0)])).toBeNull();
  });
});

describe('sumDueWithin', () => {
  const due = (amountDue: number, dueDate: string, isOverdue = false) => inv(amountDue, isOverdue, 0, 'GBP', { dueDate });

  it('counts what falls due from today to 7 days ahead, both days included', () => {
    expect(
      sumDueWithin([due(10, '2026-10-17'), due(20, '2026-10-24'), due(40, '2026-10-25'), due(80, '2026-10-10', true)], '2026-10-17', 7),
    ).toEqual({ amounts: [{ currency: 'GBP', amount: 30 }], count: 2 });
  });

  it('leaves out invoices with no due date', () => {
    expect(sumDueWithin([inv(10, false, 0, 'GBP', { dueDate: null })], '2026-10-17', 7)).toEqual({ amounts: [], count: 0 });
  });
});

describe('creditPosition', () => {
  it('works out used, available and the share of the limit used', () => {
    expect(creditPosition('5000.00', 'GBP', [inv(3000, false, 0), inv(840, true, 10)])).toEqual({
      limit: { currency: 'GBP', amount: 5000 },
      used: { currency: 'GBP', amount: 3840 },
      available: { currency: 'GBP', amount: 1160 },
      usedPercent: 77,
      overLimit: false,
    });
  });

  it('is over the limit with nothing available, never a negative amount', () => {
    expect(creditPosition('1000', 'GBP', [inv(1200, false, 0)])).toMatchObject({
      available: { currency: 'GBP', amount: 0 },
      usedPercent: 120,
      overLimit: true,
    });
  });

  it('has no limit, available or percentage when no credit limit is set', () => {
    expect(creditPosition(null, 'GBP', [inv(50, false, 0)])).toEqual({
      limit: null,
      used: { currency: 'GBP', amount: 50 },
      available: null,
      usedPercent: null,
      overLimit: false,
    });
  });

  it('only counts what is owed in the distributor currency against the limit', () => {
    expect(creditPosition('1000', 'GBP', [inv(100, false, 0, 'GBP'), inv(500, false, 0, 'EUR')]).used).toEqual({
      currency: 'GBP',
      amount: 100,
    });
  });

  it('has no percentage for a zero limit', () => {
    expect(creditPosition('0', 'GBP', [inv(10, false, 0)])).toMatchObject({ usedPercent: null, overLimit: true });
  });
});

describe('invoiceTimeline', () => {
  const paidRow = (orderId: string, dueDate: string | null, paidOn: string) => ({
    orderId,
    currency: 'GBP',
    total: 50,
    issueDate: null,
    dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
    fullyPaidOn: new Date(`${paidOn}T00:00:00Z`),
  });
  const open = (orderId: string, dueDate: string | null, daysOverdue: number) => ({
    orderId,
    orderNumber: `ORD-${orderId}`,
    externalInvoiceNumber: null,
    currency: 'GBP',
    total: 100,
    amountDue: 100,
    dueDate,
    paymentStatus: 'UNPAID' as const,
    isOverdue: daysOverdue > 0,
    daysOverdue,
  });
  const orders = new Map([
    ['o-1', { orderNumber: 'ORD-o-1', orderedOn: new Date('2026-09-01T00:00:00Z') }],
    ['o-2', { orderNumber: 'ORD-o-2', orderedOn: new Date('2026-08-20T00:00:00Z') }],
    ['o-3', { orderNumber: 'ORD-o-3', orderedOn: new Date('2026-09-10T00:00:00Z') }],
  ]);

  it('shows paid and unpaid invoices together in order date order', () => {
    expect(invoiceTimeline([paidRow('o-1', '2026-10-01', '2026-10-04')], [open('o-2', '2026-09-19', 28), open('o-3', '2026-10-20', 0)], orders)).toEqual([
      { orderId: 'o-2', orderNumber: 'ORD-o-2', orderedOn: '2026-08-20', dueDate: '2026-09-19', paidOn: null, daysLate: 28, currency: 'GBP', total: 100, amountDue: 100 },
      { orderId: 'o-1', orderNumber: 'ORD-o-1', orderedOn: '2026-09-01', dueDate: '2026-10-01', paidOn: '2026-10-04', daysLate: 3, currency: 'GBP', total: 50, amountDue: 0 },
      { orderId: 'o-3', orderNumber: 'ORD-o-3', orderedOn: '2026-09-10', dueDate: '2026-10-20', paidOn: null, daysLate: 0, currency: 'GBP', total: 100, amountDue: 100 },
    ]);
  });

  it('counts early payment as 0 days late, and has no days late without a due date', () => {
    expect(invoiceTimeline([paidRow('o-1', '2026-10-01', '2026-09-28')], [open('o-2', null, 0)], orders)).toEqual([
      { orderId: 'o-2', orderNumber: 'ORD-o-2', orderedOn: '2026-08-20', dueDate: null, paidOn: null, daysLate: null, currency: 'GBP', total: 100, amountDue: 100 },
      { orderId: 'o-1', orderNumber: 'ORD-o-1', orderedOn: '2026-09-01', dueDate: '2026-10-01', paidOn: '2026-09-28', daysLate: 0, currency: 'GBP', total: 50, amountDue: 0 },
    ]);
  });

  it('leaves out a paid invoice whose order is unknown, but keeps an unpaid one without an order date', () => {
    expect(invoiceTimeline([paidRow('o-x', '2026-10-01', '2026-10-02')], [open('o-y', '2026-10-20', 0)], orders)).toEqual([
      { orderId: 'o-y', orderNumber: 'ORD-o-y', orderedOn: null, dueDate: '2026-10-20', paidOn: null, daysLate: 0, currency: 'GBP', total: 100, amountDue: 100 },
    ]);
  });
});

describe('overdueHistory', () => {
  const TODAY = '2026-10-17';
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  let seq = 0;
  const fact = (
    exportId: string,
    on: string,
    amountDue: number,
    dueDate: string | null,
    over: Partial<OverdueFactRow> = {},
  ): OverdueFactRow => ({
    exportId,
    currency: 'GBP',
    invoiceState: 'AWAITING_PAYMENT',
    amountDue,
    dueDate: dueDate ? day(dueDate) : null,
    distributorLocalDate: day(on),
    occurredAt: new Date(day(on).getTime() + (seq += 1)),
    ...over,
  });
  const at = (history: ReturnType<typeof overdueHistory>, date: string) => history.days.find((d) => d.date === date)?.buckets;

  it('covers the last 90 days, one point a day, when facts began before the window', () => {
    const history = overdueHistory([], TODAY, 'GBP', day('2026-01-01'));
    expect(history.since).toBe('2026-07-20');
    expect(history.days).toHaveLength(OVERDUE_HISTORY_DAYS);
    expect(history.days.at(-1)).toEqual({ date: TODAY, buckets: { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } });
  });

  it('starts the day facts began, and has no history before any facts', () => {
    expect(overdueHistory([], TODAY, 'GBP', day('2026-10-15')).days.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16', TODAY]);
    expect(overdueHistory([], TODAY, 'GBP', null)).toEqual({ currency: 'GBP', since: null, days: [] });
  });

  it('moves an invoice through the bands as it ages, from the day after its due date', () => {
    const history = overdueHistory([fact('e1', '2026-07-01', 100, '2026-07-20')], TODAY, 'GBP', day('2026-07-01'));
    expect(at(history, '2026-07-20')).toEqual({ '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }); // due today: not overdue
    expect(at(history, '2026-07-21')?.['1-30']).toBe(100); // 1 day
    expect(at(history, '2026-08-19')?.['1-30']).toBe(100); // 30 days
    expect(at(history, '2026-08-20')?.['31-60']).toBe(100); // 31 days
    expect(at(history, '2026-09-18')?.['31-60']).toBe(100); // 60 days
    expect(at(history, '2026-09-19')?.['61-90']).toBe(100); // 61 days
    expect(at(history, '2026-10-18')).toBeUndefined();
    expect(at(history, TODAY)?.['61-90']).toBe(100); // 89 days
  });

  it('uses the latest fact on each day: a part-payment lowers it, payment in full clears it', () => {
    const history = overdueHistory(
      [
        fact('e1', '2026-09-01', 100, '2026-09-10'),
        fact('e1', '2026-09-20', 40, '2026-09-10'),
        fact('e1', '2026-10-01', 0, '2026-09-10', { invoiceState: 'PAID' }),
      ],
      TODAY,
      'GBP',
      day('2026-09-01'),
    );
    expect(at(history, '2026-09-19')?.['1-30']).toBe(100);
    expect(at(history, '2026-09-20')?.['1-30']).toBe(40);
    expect(at(history, '2026-10-01')?.['1-30']).toBe(0);
  });

  it('never ages a draft, a void, an invoice with no due date, or another currency', () => {
    const history = overdueHistory(
      [
        fact('draft', '2026-09-01', 100, '2026-09-10', { invoiceState: 'DRAFT' }),
        fact('void', '2026-09-01', 100, '2026-09-10', { invoiceState: 'VOIDED' }),
        fact('nodue', '2026-09-01', 100, null),
        fact('eur', '2026-09-01', 100, '2026-09-10', { currency: 'EUR' }),
        fact('gbp', '2026-09-01', 25.5, '2026-09-10'),
      ],
      TODAY,
      'GBP',
      day('2026-09-01'),
    );
    expect(at(history, TODAY)).toEqual({ '1-30': 0, '31-60': 25.5, '61-90': 0, '90+': 0 });
  });

  it('adds invoices in the same band together', () => {
    const history = overdueHistory(
      [fact('e1', '2026-09-01', 120.25, '2026-10-01'), fact('e2', '2026-09-02', 79.75, '2026-10-05')],
      TODAY,
      'GBP',
      day('2026-09-01'),
    );
    expect(at(history, TODAY)?.['1-30']).toBe(200);
  });
});

describe('sumNotYetInvoiced', () => {
  it('totals the orders per currency, never across currencies', () => {
    expect(
      sumNotYetInvoiced([
        { currency: 'GBP', totalAmount: '120.50' },
        { currency: 'EUR', totalAmount: '80.00' },
        { currency: 'GBP', totalAmount: '79.50' },
      ]),
    ).toEqual({
      amounts: [
        { currency: 'EUR', amount: 80 },
        { currency: 'GBP', amount: 200 },
      ],
      count: 3,
    });
  });

  it('is empty with no orders', () => {
    expect(sumNotYetInvoiced([])).toEqual({ amounts: [], count: 0 });
  });
});
