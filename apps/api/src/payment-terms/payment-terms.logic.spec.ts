import { PaymentTermType } from '@prisma/client';
import { calculateDueDate, describeRule, normaliseRule, PaymentTermRule } from './payment-terms.logic';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
const rule = (type: PaymentTermType, fields: Partial<PaymentTermRule> = {}): PaymentTermRule => ({
  type,
  days: null,
  dayOfWeek: null,
  dayOfMonth: null,
  ...fields,
});

describe('calculateDueDate', () => {
  it('leaves the due date to the accounting system', () => {
    expect(calculateDueDate(rule(PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT), d('2026-10-04'))).toBeNull();
  });

  it('is due on the invoice date when due immediately', () => {
    expect(iso(calculateDueDate(rule(PaymentTermType.DUE_IMMEDIATELY), d('2026-10-04')))).toBe('2026-10-04');
  });

  describe('days after invoice date', () => {
    it.each([
      ['2026-10-04', 30, '2026-11-03'],
      ['2026-10-04', 0, '2026-10-04'],
      ['2026-12-20', 14, '2027-01-03'],
      ['2028-02-15', 14, '2028-02-29'],
    ])('%s + %i days → %s', (from, days, due) => {
      expect(iso(calculateDueDate(rule(PaymentTermType.DAYS_AFTER_INVOICE, { days }), d(from)))).toBe(due);
    });
  });

  describe('days after month end', () => {
    it.each([
      ['2026-10-04', 30, '2026-11-30'],
      ['2026-10-31', 30, '2026-11-30'],
      ['2026-10-01', 0, '2026-10-31'],
      ['2027-02-10', 0, '2027-02-28'],
      ['2028-02-10', 0, '2028-02-29'],
      ['2026-12-15', 20, '2027-01-20'],
    ])('invoiced %s, %i days after month end → %s', (from, days, due) => {
      expect(iso(calculateDueDate(rule(PaymentTermType.DAYS_AFTER_MONTH_END, { days }), d(from)))).toBe(due);
    });
  });

  describe('next day of week', () => {
    // 2026-10-04 is a Sunday; 2026-10-09 a Friday.
    it.each([
      ['2026-10-04', 5, '2026-10-09'],
      ['2026-10-09', 5, '2026-10-16'],
      ['2026-10-10', 5, '2026-10-16'],
      ['2026-10-04', 7, '2026-10-11'],
      ['2026-10-04', 1, '2026-10-05'],
      ['2026-12-31', 1, '2027-01-04'],
    ])('invoiced %s, weekday %i → %s', (from, dayOfWeek, due) => {
      expect(iso(calculateDueDate(rule(PaymentTermType.DAY_OF_WEEK, { dayOfWeek }), d(from)))).toBe(due);
    });
  });

  describe('next day of month', () => {
    it.each([
      ['2026-10-04', 20, '2026-10-20'],
      ['2026-10-20', 20, '2026-11-20'],
      ['2026-10-25', 20, '2026-11-20'],
      ['2026-12-25', 20, '2027-01-20'],
      ['2027-01-31', 31, '2027-02-28'],
      ['2027-02-10', 31, '2027-02-28'],
      ['2027-02-10', 30, '2027-02-28'],
      ['2027-02-28', 30, '2027-03-30'],
      ['2028-02-10', 30, '2028-02-29'],
    ])('invoiced %s, day %i → %s', (from, dayOfMonth, due) => {
      expect(iso(calculateDueDate(rule(PaymentTermType.DAY_OF_MONTH, { dayOfMonth }), d(from)))).toBe(due);
    });
  });
});

describe('normaliseRule', () => {
  it('rejects creating the built-in accounting term', () => {
    expect(normaliseRule({ type: PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT })).toHaveProperty('error');
  });

  it('clears fields the type does not use', () => {
    expect(normaliseRule({ type: PaymentTermType.DAYS_AFTER_INVOICE, days: 30, dayOfWeek: 3, dayOfMonth: 9 })).toEqual({
      rule: rule(PaymentTermType.DAYS_AFTER_INVOICE, { days: 30 }),
    });
    expect(normaliseRule({ type: PaymentTermType.DUE_IMMEDIATELY, days: 30 })).toEqual({
      rule: rule(PaymentTermType.DUE_IMMEDIATELY),
    });
  });

  it.each([
    [PaymentTermType.DAYS_AFTER_INVOICE, { days: -1 }],
    [PaymentTermType.DAYS_AFTER_INVOICE, { days: 366 }],
    [PaymentTermType.DAYS_AFTER_INVOICE, { days: 1.5 }],
    [PaymentTermType.DAYS_AFTER_MONTH_END, {}],
    [PaymentTermType.DAY_OF_WEEK, { dayOfWeek: 0 }],
    [PaymentTermType.DAY_OF_WEEK, { dayOfWeek: 8 }],
    [PaymentTermType.DAY_OF_MONTH, { dayOfMonth: 0 }],
    [PaymentTermType.DAY_OF_MONTH, { dayOfMonth: 32 }],
    [PaymentTermType.DAY_OF_MONTH, { dayOfMonth: null }],
  ])('rejects %s with %j', (type, fields) => {
    expect(normaliseRule({ type, ...fields })).toHaveProperty('error');
  });

  it('accepts boundary values', () => {
    expect(normaliseRule({ type: PaymentTermType.DAYS_AFTER_MONTH_END, days: 0 })).toHaveProperty('rule');
    expect(normaliseRule({ type: PaymentTermType.DAYS_AFTER_INVOICE, days: 365 })).toHaveProperty('rule');
    expect(normaliseRule({ type: PaymentTermType.DAY_OF_WEEK, dayOfWeek: 7 })).toHaveProperty('rule');
    expect(normaliseRule({ type: PaymentTermType.DAY_OF_MONTH, dayOfMonth: 31 })).toHaveProperty('rule');
  });
});

describe('describeRule', () => {
  it.each([
    [rule(PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT), 'Due date set by the accounting software'],
    [rule(PaymentTermType.DUE_IMMEDIATELY), 'Due on the invoice date'],
    [rule(PaymentTermType.DAYS_AFTER_INVOICE, { days: 30 }), '30 days after the invoice date'],
    [rule(PaymentTermType.DAYS_AFTER_INVOICE, { days: 1 }), '1 day after the invoice date'],
    [rule(PaymentTermType.DAYS_AFTER_MONTH_END, { days: 30 }), '30 days after the end of the invoice month'],
    [rule(PaymentTermType.DAYS_AFTER_MONTH_END, { days: 0 }), 'End of the invoice month'],
    [rule(PaymentTermType.DAY_OF_WEEK, { dayOfWeek: 5 }), 'The next Friday after the invoice date'],
    [rule(PaymentTermType.DAY_OF_MONTH, { dayOfMonth: 1 }), 'The next 1st of the month after the invoice date'],
    [rule(PaymentTermType.DAY_OF_MONTH, { dayOfMonth: 22 }), 'The next 22nd of the month after the invoice date'],
    [rule(PaymentTermType.DAY_OF_MONTH, { dayOfMonth: 13 }), 'The next 13th of the month after the invoice date'],
    [rule(PaymentTermType.DAY_OF_MONTH, { dayOfMonth: 30 }), 'The next 30th of a month (or its last day) after the invoice date'],
    [rule(PaymentTermType.DAY_OF_MONTH, { dayOfMonth: 31 }), 'The next month end after the invoice date'],
  ])('describes %j', (r, text) => {
    expect(describeRule(r)).toBe(text);
  });
});
