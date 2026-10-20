import type {
  CustomerCreditPosition,
  CustomerOldestOverdueInvoice,
  CustomerOpenInvoice,
  CustomerInvoiceTimelineEntry,
  CustomerOverdueHistory,
  CustomerPaymentSummary,
  MoneyAmount,
  OverdueAgeingBucket,
  PaymentTrendStatus,
} from '@wholo/types';
import { derivePaymentStatus, InvoicePaymentFacts, isOverdue } from '../accounting/invoice-payment-status';

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const money = (v: { toString(): string } | null | undefined) => (v == null ? 0 : Math.round(Number(v.toString()) * 100) / 100);

export interface OpenInvoiceRow extends InvoicePaymentFacts {
  orderId: string;
  externalInvoiceNumber: string | null;
  order: { orderNumber: string; currency: string };
}

export function toOpenInvoice(row: OpenInvoiceRow, today: string): CustomerOpenInvoice {
  const overdue = isOverdue(row, today);
  const daysOverdue =
    overdue && row.dueDate ? Math.round((Date.parse(`${today}T00:00:00Z`) - row.dueDate.getTime()) / DAY_MS) : 0;
  return {
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    externalInvoiceNumber: row.externalInvoiceNumber,
    currency: row.order.currency,
    total: money(row.invoiceTotal),
    amountDue: money(row.amountDue),
    dueDate: row.dueDate ? isoDate(row.dueDate) : null,
    paymentStatus: derivePaymentStatus(row),
    isOverdue: overdue,
    daysOverdue,
  };
}

export interface PaidInvoiceRow {
  issueDate: Date | null;
  dueDate: Date | null;
  fullyPaidOn: Date | null;
}

// Days paid after the due date; paying early or on the day counts as 0.
const daysLate = (r: PaidInvoiceRow) => Math.max(0, (r.fullyPaidOn!.getTime() - r.dueDate!.getTime()) / DAY_MS);

const mean = (values: number[]) =>
  values.length === 0 ? null : Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;

// How promptly a customer pays: mean days from invoice date to fully paid,
// mean days paid after the due date, and the share paid on or before the due
// date. Invoices without the dates a measure needs are left out of that
// measure only. The trend is filled in by the caller (paymentTrend).
export function summarisePaid(rows: PaidInvoiceRow[]): Omit<CustomerPaymentSummary['last90Days'], 'trend'> {
  const paid = rows.filter((r) => r.fullyPaidOn);
  const withIssue = paid.filter((r) => r.issueDate);
  const withDue = paid.filter((r) => r.dueDate);
  const averageDaysToPay = mean(withIssue.map((r) => (r.fullyPaidOn!.getTime() - r.issueDate!.getTime()) / DAY_MS));
  // The terms the invoices were raised on, as days from invoice date to due date.
  const averageDaysAllowed = mean(withIssue.filter((r) => r.dueDate).map((r) => (r.dueDate!.getTime() - r.issueDate!.getTime()) / DAY_MS));
  const averageDaysLate = mean(withDue.map(daysLate));
  const paidOnTimePercent =
    withDue.length === 0
      ? null
      : Math.round((withDue.filter((r) => r.fullyPaidOn!.getTime() <= r.dueDate!.getTime()).length / withDue.length) * 100);
  return { paidCount: paid.length, averageDaysToPay, averageDaysAllowed, averageDaysLate, paidOnTimePercent };
}

export interface TimelineOrder {
  orderNumber: string;
  orderedOn: Date | null;
}

// Every raised invoice the timeline shows: unpaid ones (whenever raised) and
// those paid in the window, in order date order. A paid invoice whose order
// cannot be found is left out. Due dates are the accounting system's only
// (ADR-006); an invoice without one has no days late.
export function invoiceTimeline(
  paid: Array<PaidInvoiceRow & { orderId: string; currency: string; total: number | { toString(): string } }>,
  open: CustomerOpenInvoice[],
  orders: Map<string, TimelineOrder>,
): CustomerInvoiceTimelineEntry[] {
  const orderedOn = (orderId: string) => {
    const date = orders.get(orderId)?.orderedOn;
    return date ? isoDate(date) : null;
  };
  const paidEntries = paid
    .filter((r) => r.fullyPaidOn && orders.has(r.orderId))
    .map((r) => ({
      orderId: r.orderId,
      orderNumber: orders.get(r.orderId)!.orderNumber,
      orderedOn: orderedOn(r.orderId),
      dueDate: r.dueDate ? isoDate(r.dueDate) : null,
      paidOn: isoDate(r.fullyPaidOn!),
      daysLate: r.dueDate ? Math.round(daysLate(r)) : null,
      currency: r.currency,
      total: Number(r.total),
      amountDue: 0,
    }));
  const openEntries = open.map((invoice) => ({
    orderId: invoice.orderId,
    orderNumber: invoice.orderNumber,
    orderedOn: orderedOn(invoice.orderId),
    dueDate: invoice.dueDate,
    paidOn: null,
    daysLate: invoice.dueDate ? invoice.daysOverdue : null,
    currency: invoice.currency,
    total: invoice.total,
    amountDue: invoice.amountDue,
  }));
  const sortKey = (e: CustomerInvoiceTimelineEntry) => e.orderedOn ?? e.paidOn ?? e.dueDate ?? '';
  return [...paidEntries, ...openEntries].sort(
    (a, b) => sortKey(a).localeCompare(sortKey(b)) || a.orderNumber.localeCompare(b.orderNumber),
  );
}

// A trend needs this many paid invoices (with a due date) in each period —
// fewer and one late payment swings the average.
export const PAYMENT_TREND_MIN_INVOICES = 3;
// The change in average days late that counts as better or worse rather than noise.
export const PAYMENT_TREND_MIN_CHANGE_DAYS = 3;

// Average days late in the current period against the one before it.
export function paymentTrend(current: PaidInvoiceRow[], previous: PaidInvoiceRow[]): PaymentTrendStatus {
  const usable = (rows: PaidInvoiceRow[]) => rows.filter((r) => r.fullyPaidOn && r.dueDate);
  const now = usable(current);
  const before = usable(previous);
  if (now.length < PAYMENT_TREND_MIN_INVOICES || before.length < PAYMENT_TREND_MIN_INVOICES) return 'insufficient_history';
  const change = mean(now.map(daysLate))! - mean(before.map(daysLate))!;
  if (change <= -PAYMENT_TREND_MIN_CHANGE_DAYS) return 'improving';
  if (change >= PAYMENT_TREND_MIN_CHANGE_DAYS) return 'worsening';
  return 'steady';
}

const round = (n: number) => Math.round(n * 100) / 100;

// What is still due, totalled per currency (never across currencies), in
// currency-code order so the result is stable.
export function sumDueByCurrency(invoices: Array<Pick<CustomerOpenInvoice, 'currency' | 'amountDue'>>): MoneyAmount[] {
  const totals = new Map<string, number>();
  for (const i of invoices) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.amountDue);
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: round(amount) }));
}

const AGEING_BUCKETS: Array<{ bucket: OverdueAgeingBucket; from: number; to: number }> = [
  { bucket: '1-30', from: 1, to: 30 },
  { bucket: '31-60', from: 31, to: 60 },
  { bucket: '61-90', from: 61, to: 90 },
  { bucket: '90+', from: 91, to: Infinity },
];

// Overdue invoices by days past due — always all four bands, in order.
export function ageOverdue(invoices: CustomerOpenInvoice[]): CustomerPaymentSummary['overdue']['ageing'] {
  const overdue = invoices.filter((i) => i.isOverdue);
  return AGEING_BUCKETS.map(({ bucket, from, to }) => {
    const inBand = overdue.filter((i) => i.daysOverdue >= from && i.daysOverdue <= to);
    return { bucket, amounts: sumDueByCurrency(inBand), count: inBand.length };
  });
}

/** One invoice fact, as the overdue history reads it. */
export interface OverdueFactRow extends InvoicePaymentFacts {
  exportId: string;
  currency: string;
  distributorLocalDate: Date;
  occurredAt: Date;
}

export const OVERDUE_HISTORY_DAYS = 90;

// What was overdue at the end of each day of the window, by days past due, in
// one currency. Each invoice counts as its latest fact on or before the day,
// judged with the same isOverdue as today's figures, so a draft or an invoice
// with no due date is never aged. History starts the day facts began
// (`firstFactDate`, across the distributor) — there is no backfill.
export function overdueHistory(
  facts: OverdueFactRow[],
  today: string,
  currency: string,
  firstFactDate: Date | null,
): CustomerOverdueHistory {
  const windowStart = isoDate(new Date(Date.parse(`${today}T00:00:00Z`) - (OVERDUE_HISTORY_DAYS - 1) * DAY_MS));
  const firstDay = firstFactDate ? isoDate(firstFactDate) : null;
  const since = firstDay === null || firstDay > today ? null : firstDay > windowStart ? firstDay : windowStart;
  if (since === null) return { currency, since: null, days: [] };

  const ordered = facts
    .filter((f) => f.currency === currency)
    .sort((a, b) => a.distributorLocalDate.getTime() - b.distributorLocalDate.getTime() || a.occurredAt.getTime() - b.occurredAt.getTime());
  const latest = new Map<string, OverdueFactRow>();
  let next = 0;
  const days: CustomerOverdueHistory['days'] = [];
  for (let ms = Date.parse(`${since}T00:00:00Z`); ms <= Date.parse(`${today}T00:00:00Z`); ms += DAY_MS) {
    const date = isoDate(new Date(ms));
    while (next < ordered.length && isoDate(ordered[next].distributorLocalDate) <= date) {
      latest.set(ordered[next].exportId, ordered[next]);
      next += 1;
    }
    const buckets: Record<OverdueAgeingBucket, number> = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const fact of latest.values()) {
      if (!isOverdue(fact, date)) continue;
      const daysOverdue = Math.round((ms - fact.dueDate!.getTime()) / DAY_MS);
      const band = AGEING_BUCKETS.find(({ from, to }) => daysOverdue >= from && daysOverdue <= to);
      if (band) buckets[band.bucket] += money(fact.amountDue);
    }
    for (const key of Object.keys(buckets) as OverdueAgeingBucket[]) buckets[key] = round(buckets[key]);
    days.push({ date, buckets });
  }
  return { currency, since, days };
}

// The overdue invoice that has waited longest; ties go to the larger amount.
export function oldestOverdue(invoices: CustomerOpenInvoice[]): CustomerOldestOverdueInvoice | null {
  const [oldest] = invoices
    .filter((i) => i.isOverdue)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amountDue - a.amountDue);
  if (!oldest) return null;
  return {
    orderId: oldest.orderId,
    orderNumber: oldest.orderNumber,
    externalInvoiceNumber: oldest.externalInvoiceNumber,
    currency: oldest.currency,
    amountDue: oldest.amountDue,
    daysOverdue: oldest.daysOverdue,
  };
}

// Unpaid invoices not yet overdue that fall due from today to today + days.
export function sumDueWithin(
  invoices: CustomerOpenInvoice[],
  today: string,
  days: number,
): CustomerPaymentSummary['dueNext7Days'] {
  const last = isoDate(new Date(Date.parse(`${today}T00:00:00Z`) + days * DAY_MS));
  const due = invoices.filter((i) => !i.isOverdue && i.amountDue > 0 && i.dueDate != null && i.dueDate >= today && i.dueDate <= last);
  return { amounts: sumDueByCurrency(due), count: due.length };
}

// Outstanding balance against the credit limit. The limit is in the
// distributor's currency, so only what is owed in that currency counts.
export function creditPosition(
  limit: { toString(): string } | null,
  currency: string,
  invoices: CustomerOpenInvoice[],
): CustomerCreditPosition {
  const used = round(invoices.filter((i) => i.currency === currency).reduce((sum, i) => sum + i.amountDue, 0));
  if (limit == null) {
    return { limit: null, used: { currency, amount: used }, available: null, usedPercent: null, overLimit: false };
  }
  const amount = money(limit);
  return {
    limit: { currency, amount },
    used: { currency, amount: used },
    available: { currency, amount: round(Math.max(0, amount - used)) },
    usedPercent: amount > 0 ? Math.round((used / amount) * 100) : null,
    overLimit: used > amount,
  };
}

export interface UninvoicedOrderRow {
  currency: string;
  totalAmount: { toString(): string };
}

// Accepted orders the accounting system has no invoice for yet: what the
// customer will owe once they are invoiced. The caller picks the orders.
export function sumNotYetInvoiced(orders: UninvoicedOrderRow[]): CustomerPaymentSummary['notYetInvoiced'] {
  return {
    amounts: sumDueByCurrency(orders.map((o) => ({ currency: o.currency, amountDue: money(o.totalAmount) }))),
    count: orders.length,
  };
}

export function summariseOpen(invoices: CustomerOpenInvoice[]): Pick<CustomerPaymentSummary, 'outstanding' | 'overdue'> {
  const overdue = invoices.filter((i) => i.isOverdue);
  return {
    outstanding: {
      amounts: sumDueByCurrency(invoices),
      count: invoices.length,
      orderCount: new Set(invoices.map((i) => i.orderId)).size,
    },
    overdue: {
      amounts: sumDueByCurrency(overdue),
      count: overdue.length,
      oldestDaysOverdue: overdue.length === 0 ? null : Math.max(...overdue.map((i) => i.daysOverdue)),
      ageing: ageOverdue(invoices),
      oldest: oldestOverdue(invoices),
    },
  };
}
