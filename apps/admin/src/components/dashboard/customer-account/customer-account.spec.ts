import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CustomerOpenInvoice, CustomerOverdueHistory, CustomerPaymentSummary } from '@wholo/types';
import {
  accountAlert,
  accountingSyncText,
  exposure,
  exposureSummary,
  nextPaymentDue,
  overdueStory,
  paidByDueDate,
  formatMoneyAmounts,
  NOT_ENOUGH_HISTORY,
  orderingTrendText,
  paymentTrendText,
  plural,
  shortDate,
} from './customer-account';

afterEach(() => vi.useRealTimers());

describe('formatMoneyAmounts', () => {
  it('shows whole units per currency, never added together', () => {
    expect(
      formatMoneyAmounts(
        [
          { currency: 'GBP', amount: 3840 },
          { currency: 'EUR', amount: 80 },
        ],
        'GBP',
      ),
    ).toBe('£3,840 + €80');
  });

  it("is zero in the distributor's currency when nothing is owed", () => {
    expect(formatMoneyAmounts([], 'GBP')).toBe('£0');
  });
});

describe('plural', () => {
  it('pluralises by count', () => {
    expect(plural(1, 'invoice')).toBe('1 invoice');
    expect(plural(6, 'invoice')).toBe('6 invoices');
  });
});

describe('trend text', () => {
  it('says there is not enough history rather than guessing a trend', () => {
    expect(paymentTrendText('insufficient_history')).toBe(NOT_ENOUGH_HISTORY);
    expect(orderingTrendText('insufficient_history', 30)).toBe(NOT_ENOUGH_HISTORY);
  });

  it('names the comparison period', () => {
    expect(paymentTrendText('worsening')).toMatch(/90 days before/);
    expect(orderingTrendText('up', 30)).toMatch(/previous 30 days/);
  });
});

describe('accountingSyncText', () => {
  it('says when invoices last synced', () => {
    vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
    expect(accountingSyncText({ connected: true, lastSyncedAt: '2026-10-17T11:55:00Z' })).toBe('Accounting data synced 5 minutes ago');
  });

  it('says when accounting is not connected or has never synced', () => {
    expect(accountingSyncText({ connected: false, lastSyncedAt: null })).toMatch(/not connected/);
    expect(accountingSyncText({ connected: true, lastSyncedAt: null })).toBe('Accounting data not synced yet');
  });
});

describe('shortDate', () => {
  it('formats a plain date without shifting the day', () => {
    expect(shortDate('2026-10-08')).toBe('8 Oct 2026');
    expect(shortDate(null)).toBe('—');
  });
});

describe('summaries for screen readers', () => {
  it('reads out the total, what makes it up, and the limit', () => {
    const credit = { limit: { currency: 'GBP', amount: 5000 }, used: { currency: 'GBP', amount: 3840 }, available: { currency: 'GBP', amount: 1160 }, usedPercent: 77, overLimit: false };
    expect(exposureSummary(credit, { amounts: [], count: 0 })).toBe('£3,840 owed, against a £5,000 credit limit (77% used)');
    expect(exposureSummary(credit, { amounts: [{ currency: 'GBP', amount: 1600 }], count: 1 })).toBe(
      '£5,440 in total: £3,840 owed and £1,600 in orders not invoiced, against a £5,000 credit limit (109% used), £440 over',
    );
    expect(exposureSummary({ ...credit, limit: null, available: null, usedPercent: null }, { amounts: [], count: 0 })).toBe('£3,840 owed; no credit limit set');
  });
});

const invoice = (over: Partial<CustomerOpenInvoice>): CustomerOpenInvoice => ({
  orderId: 'o', orderNumber: 'ORD', externalInvoiceNumber: null, currency: 'GBP', total: 100, amountDue: 100,
  dueDate: '2026-12-01', paymentStatus: 'UNPAID', isOverdue: false, daysOverdue: 0, ...over,
});

describe('exposure', () => {
  const credit = { limit: { currency: 'GBP', amount: 100 }, used: { currency: 'GBP', amount: 482 }, available: { currency: 'GBP', amount: 0 }, usedPercent: 482, overLimit: true };

  it('adds orders not invoiced to what is owed, and measures that total against the limit', () => {
    expect(exposure(credit, { amounts: [{ currency: 'GBP', amount: 591.16 }], count: 1 })).toEqual({
      owed: 482, notInvoiced: 591.16, total: 1073.16, limit: 100, over: 973.16, available: 0, usedPercent: 1073,
    });
  });

  it('counts only orders in the limit\'s currency', () => {
    expect(exposure(credit, { amounts: [{ currency: 'EUR', amount: 50 }], count: 1 })).toMatchObject({ notInvoiced: 0, total: 482 });
  });

  it('has nothing over or available without a limit', () => {
    expect(exposure({ ...credit, limit: null, available: null, usedPercent: null, overLimit: false }, { amounts: [], count: 0 })).toMatchObject({
      limit: null, over: 0, available: null, usedPercent: null,
    });
  });
});

describe('nextPaymentDue', () => {
  it('finds the earliest due date still to come and totals what falls due on it', () => {
    expect(
      nextPaymentDue(
        [
          invoice({ dueDate: '2026-12-01', amountDue: 300 }),
          invoice({ dueDate: '2026-11-30', amountDue: 182 }),
          invoice({ dueDate: '2026-11-30', amountDue: 100 }),
          invoice({ dueDate: '2026-09-01', isOverdue: true, daysOverdue: 49 }),
          invoice({ dueDate: null }),
        ],
        '2026-10-20',
      ),
    ).toEqual({ dueDate: '2026-11-30', inDays: 41, amounts: [{ currency: 'GBP', amount: 282 }], count: 2 });
  });

  it('is null when nothing is still to fall due', () => {
    expect(nextPaymentDue([invoice({ isOverdue: true }), invoice({ dueDate: null })], '2026-10-20')).toBeNull();
  });
});

describe('overdueStory', () => {
  const day = (date: string, total: number) => ({ date, buckets: { '1-30': total, '31-60': 0, '61-90': 0, '90+': 0 } });
  const history = (days: CustomerOverdueHistory['days']): CustomerOverdueHistory => ({ currency: 'GBP', since: days[0]?.date ?? null, days });

  it('says when the overdue balance was cleared and how high it got', () => {
    expect(overdueStory(history([day('2026-08-05', 4000), day('2026-08-06', 4680), day('2026-10-12', 200), day('2026-10-13', 0), day('2026-10-14', 0)]))).toBe(
      'Cleared 13 Oct · peak £4,680 on 6 Aug',
    );
  });

  it('has nothing to say when nothing was ever overdue, something still is, or there is no history', () => {
    expect(overdueStory(history([day('2026-10-13', 0), day('2026-10-14', 0)]))).toBeNull();
    expect(overdueStory(history([day('2026-10-13', 0), day('2026-10-14', 50)]))).toBeNull();
    expect(overdueStory(history([]))).toBeNull();
  });
});

describe('paidByDueDate', () => {
  it('counts paid invoices with a due date, and those paid by it', () => {
    const entry = (paidOn: string | null, daysLate: number | null) => ({
      orderId: 'o', orderNumber: 'ORD', orderedOn: null, dueDate: null, paidOn, daysLate, currency: 'GBP', total: 1, amountDue: 0,
    });
    expect(paidByDueDate([entry('2026-10-01', 0), entry('2026-10-01', 5), entry('2026-10-01', null), entry(null, 3)])).toEqual({ onTime: 1, judged: 2 });
  });
});

describe('accountAlert', () => {
  const base: CustomerPaymentSummary = {
    customerId: 'c',
    asOf: '2026-10-20',
    outstanding: { amounts: [{ currency: 'GBP', amount: 482 }], count: 2, orderCount: 2 },
    overdue: { amounts: [], count: 0, oldestDaysOverdue: null, ageing: [], oldest: null },
    dueNext7Days: { amounts: [], count: 0 },
    credit: { limit: { currency: 'GBP', amount: 100 }, used: { currency: 'GBP', amount: 482 }, available: { currency: 'GBP', amount: 0 }, usedPercent: 482, overLimit: true },
    last90Days: { paidCount: 0, averageDaysToPay: null, averageDaysAllowed: null, averageDaysLate: null, paidOnTimePercent: null, trend: 'insufficient_history' },
    invoiceTimeline: [],
    overdueHistory: { currency: 'GBP', since: null, days: [] },
    notYetInvoiced: { amounts: [], count: 0 },
    accountingSync: { connected: true, lastSyncedAt: null },
    openInvoices: [invoice({ amountDue: 300, dueDate: '2026-12-01' }), invoice({ amountDue: 182, dueDate: '2026-12-01' })],
  };

  it('warns about being over the limit, and when the open invoices fall due', () => {
    expect(accountAlert(base, 'GBP')).toEqual({
      title: '£482 owed against a £100 limit · 4.8× over',
      detail: 'Nothing is overdue yet. Both open invoices fall due on 1 Dec.',
    });
  });

  it('says how much of it is overdue when over the limit and overdue', () => {
    const summary = { ...base, overdue: { ...base.overdue, amounts: [{ currency: 'GBP', amount: 182 }], count: 1, oldestDaysOverdue: 12 } };
    expect(accountAlert(summary, 'GBP')!.detail).toBe('£182 of it is overdue; the oldest is 12 days past due.');
  });

  it('warns about overdue invoices within the limit', () => {
    const summary = {
      ...base,
      credit: { ...base.credit, limit: { currency: 'GBP', amount: 5000 }, overLimit: false },
      overdue: { ...base.overdue, amounts: [{ currency: 'GBP', amount: 182 }], count: 1, oldestDaysOverdue: 1 },
    };
    expect(accountAlert(summary, 'GBP')).toEqual({ title: '£182 overdue on 1 invoice', detail: 'The oldest is 1 day past due.' });
  });

  it('has no alert within the limit with nothing overdue', () => {
    expect(accountAlert({ ...base, credit: { ...base.credit, overLimit: false } }, 'GBP')).toBeNull();
  });
});
