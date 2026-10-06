import { PaymentTermType } from '@prisma/client';

/**
 * Pure due-date rules (ADR-075). Every date here is a calendar day carried as
 * a UTC-midnight Date — the same convention as Prisma's `@db.Date` columns and
 * `distributorLocalDate` — so the maths never crosses a timezone.
 */

export interface PaymentTermRule {
  type: PaymentTermType;
  days: number | null;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  dayOfWeek: number | null;
  /** 1–31, clamped to the last day of shorter months. */
  dayOfMonth: number | null;
}

export const MAX_TERM_DAYS = 365;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// Day `day` of the given month, clamped so 31 means "the last day".
function clampedDayOfMonth(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth(year, month))));
}

function isoWeekday(date: Date): number {
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay();
}

/**
 * The due date for an invoice dated `invoiceDate` under `rule`, or null when
 * the rule leaves the due date to the accounting system.
 *
 * "Day of week" and "day of month" pick the next occurrence strictly after
 * the invoice date — an invoice dated on a Friday under "next Friday" is due
 * a week later, never the same day.
 */
export function calculateDueDate(rule: PaymentTermRule, invoiceDate: Date): Date | null {
  const year = invoiceDate.getUTCFullYear();
  const month = invoiceDate.getUTCMonth();

  switch (rule.type) {
    case PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT:
      return null;
    case PaymentTermType.DUE_IMMEDIATELY:
      return addDays(invoiceDate, 0);
    case PaymentTermType.DAYS_AFTER_INVOICE:
      return addDays(invoiceDate, rule.days ?? 0);
    case PaymentTermType.DAYS_AFTER_MONTH_END:
      return addDays(new Date(Date.UTC(year, month, lastDayOfMonth(year, month))), rule.days ?? 0);
    case PaymentTermType.DAY_OF_WEEK: {
      const ahead = (rule.dayOfWeek! - isoWeekday(invoiceDate) + 7) % 7;
      return addDays(invoiceDate, ahead === 0 ? 7 : ahead);
    }
    case PaymentTermType.DAY_OF_MONTH: {
      const thisMonth = clampedDayOfMonth(year, month, rule.dayOfMonth!);
      return thisMonth > invoiceDate ? thisMonth : clampedDayOfMonth(year, month + 1, rule.dayOfMonth!);
    }
  }
}

/**
 * Checks a rule a distributor is creating or editing, and returns it with the
 * fields its type doesn't use cleared — or a message saying what's wrong.
 * ACCOUNTING_SYSTEM_DEFAULT is built in (one per distributor) and can't be
 * created by hand.
 */
export function normaliseRule(
  input: Partial<PaymentTermRule> & { type: PaymentTermType },
): { rule: PaymentTermRule } | { error: string } {
  const rule: PaymentTermRule = { type: input.type, days: null, dayOfWeek: null, dayOfMonth: null };
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

  switch (input.type) {
    case PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT:
      return { error: 'The accounting-software term is built in and cannot be created' };
    case PaymentTermType.DUE_IMMEDIATELY:
      return { rule };
    case PaymentTermType.DAYS_AFTER_INVOICE:
    case PaymentTermType.DAYS_AFTER_MONTH_END:
      if (!isInt(input.days) || input.days < 0 || input.days > MAX_TERM_DAYS) {
        return { error: `days must be a whole number from 0 to ${MAX_TERM_DAYS}` };
      }
      return { rule: { ...rule, days: input.days } };
    case PaymentTermType.DAY_OF_WEEK:
      if (!isInt(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 7) {
        return { error: 'dayOfWeek must be 1 (Monday) to 7 (Sunday)' };
      }
      return { rule: { ...rule, dayOfWeek: input.dayOfWeek } };
    case PaymentTermType.DAY_OF_MONTH:
      if (!isInt(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) {
        return { error: 'dayOfMonth must be 1 to 31' };
      }
      return { rule: { ...rule, dayOfMonth: input.dayOfMonth } };
    default:
      return { error: 'Unknown payment term type' };
  }
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** One-line plain-English description of a rule, for lists and selects. */
export function describeRule(rule: PaymentTermRule): string {
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  switch (rule.type) {
    case PaymentTermType.ACCOUNTING_SYSTEM_DEFAULT:
      return 'Due date set by the accounting software';
    case PaymentTermType.DUE_IMMEDIATELY:
      return 'Due on the invoice date';
    case PaymentTermType.DAYS_AFTER_INVOICE:
      return `${days(rule.days ?? 0)} after the invoice date`;
    case PaymentTermType.DAYS_AFTER_MONTH_END:
      return rule.days ? `${days(rule.days)} after the end of the invoice month` : 'End of the invoice month';
    case PaymentTermType.DAY_OF_WEEK:
      return `The next ${WEEKDAYS[rule.dayOfWeek! - 1]} after the invoice date`;
    case PaymentTermType.DAY_OF_MONTH:
      if (rule.dayOfMonth === 31) return 'The next month end after the invoice date';
      return rule.dayOfMonth! > 28
        ? `The next ${ordinal(rule.dayOfMonth!)} of a month (or its last day) after the invoice date`
        : `The next ${ordinal(rule.dayOfMonth!)} of the month after the invoice date`;
  }
}
