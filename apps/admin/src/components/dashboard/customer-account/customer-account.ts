import type {
  CustomerInvoiceTimelineEntry,
  CustomerOpenInvoice,
  CustomerOverdueHistory,
  CustomerPaymentSummary,
  MoneyAmount,
  OrderingTrendStatus,
  OverdueAgeingBucket,
  PaymentTrendStatus,
} from '@wholo/types';
import { formatAmounts } from '@/lib/money-amounts';
import { relativeTime } from '@/lib/date';
import { makeCurrencyFormatter } from '../currency';

/** Per-currency amounts in whole units ("£3,840", or "£3,840 + €80"); zero in the distributor's currency when empty. */
export function formatMoneyAmounts(amounts: MoneyAmount[], distributorCurrency: string): string {
  return formatAmounts(amounts, distributorCurrency, (amount, currency) => makeCurrencyFormatter(currency)(amount));
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

// Darker the older: the bands differ in lightness, not only hue, so they can
// be told apart without colour vision (the legend also names each one).
export const AGEING_META: Record<OverdueAgeingBucket, { label: string; colour: string }> = {
  '1-30': { label: '1–30 days', colour: '#F29A62' },
  '31-60': { label: '31–60 days', colour: '#DD3B3B' },
  '61-90': { label: '61–90 days', colour: '#8E1B20' },
  '90+': { label: '90+ days', colour: '#4A0C10' },
};

export const NOT_ENOUGH_HISTORY = 'Not enough history';

export function paymentTrendText(trend: PaymentTrendStatus): string {
  switch (trend) {
    case 'insufficient_history':
      return NOT_ENOUGH_HISTORY;
    case 'improving':
      return 'Paying sooner than the 90 days before';
    case 'worsening':
      return 'Paying later than the 90 days before';
    case 'steady':
      return 'About the same as the 90 days before';
  }
}

export function orderingTrendText(trend: OrderingTrendStatus, periodDays: number): string {
  switch (trend) {
    case 'insufficient_history':
      return NOT_ENOUGH_HISTORY;
    case 'up':
      return `Spending more than the previous ${periodDays} days`;
    case 'down':
      return `Spending less than the previous ${periodDays} days`;
    case 'steady':
      return `Spending about the same as the previous ${periodDays} days`;
  }
}

/** When the owed / overdue figures were last brought up to date from the accounting system. */
export function accountingSyncText(sync: CustomerPaymentSummary['accountingSync']): string {
  if (!sync.connected) return 'Accounting not connected — invoice figures may be incomplete';
  if (!sync.lastSyncedAt) return 'Accounting data not synced yet';
  return `Accounting data synced ${relativeTime(sync.lastSyncedAt)}`;
}

/** "8 Oct 2026" from a YYYY-MM-DD date, without shifting it a day either side. */
export function shortDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  return new Date(`${isoDate.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The figures behind the exposure headline and bar: what is owed plus orders
 * not yet invoiced (in the limit's currency), and that total against the
 * limit. The headline shows the total, so it always matches the bar.
 */
export interface Exposure {
  owed: number;
  notInvoiced: number;
  total: number;
  limit: number | null;
  /** How far the total is past the limit; 0 within it. */
  over: number;
  /** How much of the limit is left; null without a limit. */
  available: number | null;
  /** total / limit as a whole percentage; null without a limit or with a 0 limit. */
  usedPercent: number | null;
}

export function exposure(credit: CustomerPaymentSummary['credit'], notYetInvoiced: CustomerPaymentSummary['notYetInvoiced']): Exposure {
  const owed = credit.used.amount;
  const notInvoiced = notYetInvoiced.amounts.find((a) => a.currency === credit.used.currency)?.amount ?? 0;
  const total = Math.round((owed + notInvoiced) * 100) / 100;
  const limit = credit.limit?.amount ?? null;
  return {
    owed,
    notInvoiced,
    total,
    limit,
    over: limit === null ? 0 : Math.max(0, Math.round((total - limit) * 100) / 100),
    available: limit === null ? null : Math.max(0, Math.round((limit - total) * 100) / 100),
    usedPercent: limit ? Math.round((total / limit) * 100) : null,
  };
}

/** Screen-reader summary of the exposure bar: the total, what makes it up, and the limit. */
export function exposureSummary(credit: CustomerPaymentSummary['credit'], notYetInvoiced: CustomerPaymentSummary['notYetInvoiced']): string {
  const fmt = makeCurrencyFormatter(credit.used.currency);
  const e = exposure(credit, notYetInvoiced);
  const amount = e.notInvoiced > 0 ? `${fmt(e.total)} in total: ${fmt(e.owed)} owed and ${fmt(e.notInvoiced)} in orders not invoiced` : `${fmt(e.owed)} owed`;
  if (e.limit === null) return `${amount}; no credit limit set`;
  const used = e.usedPercent === null ? '' : ` (${e.usedPercent}% used)`;
  return `${amount}, against a ${fmt(e.limit)} credit limit${used}${e.over > 0 ? `, ${fmt(e.over)} over` : ''}`;
}

/** "1 Dec" from a YYYY-MM-DD date: the day and month only, for figures within the year. */
export function dayMonth(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The earliest due date among the unpaid invoices not yet overdue, and what falls due on it. */
export interface NextPaymentDue {
  dueDate: string;
  inDays: number;
  amounts: MoneyAmount[];
  count: number;
}

export function nextPaymentDue(openInvoices: CustomerOpenInvoice[], today: string): NextPaymentDue | null {
  const upcoming = openInvoices.filter((i) => !i.isOverdue && i.amountDue > 0 && i.dueDate !== null && i.dueDate >= today);
  if (upcoming.length === 0) return null;
  const dueDate = upcoming.map((i) => i.dueDate!).sort()[0];
  const onDate = upcoming.filter((i) => i.dueDate === dueDate);
  const amounts: MoneyAmount[] = [];
  for (const i of onDate) {
    const same = amounts.find((a) => a.currency === i.currency);
    if (same) same.amount += i.amountDue;
    else amounts.push({ currency: i.currency, amount: i.amountDue });
  }
  return { dueDate, inDays: daysBetween(today, dueDate), amounts, count: onDate.length };
}

/** "in 42 days", "tomorrow", "today". */
export function inDaysText(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

const historyTotal = (day: CustomerOverdueHistory['days'][number]) => Object.values(day.buckets).reduce((sum, v) => sum + v, 0);

/**
 * How the overdue balance got to where it is today, from the daily history:
 * when it was last cleared and its highest point. Null when nothing was
 * overdue in the history, or when something still is (the tile says how much).
 */
export function overdueStory(history: CustomerOverdueHistory): string | null {
  const days = history.days;
  const peak = days.reduce<CustomerOverdueHistory['days'][number] | null>((max, d) => (historyTotal(d) > (max ? historyTotal(max) : 0) ? d : max), null);
  const last = days.at(-1);
  if (!peak || !last || historyTotal(last) > 0) return null;
  let cleared = days.length - 1;
  while (cleared > 0 && historyTotal(days[cleared - 1]) === 0) cleared -= 1;
  const fmt = makeCurrencyFormatter(history.currency);
  return `Cleared ${dayMonth(days[cleared].date)} · peak ${fmt(historyTotal(peak))} on ${dayMonth(peak.date)}`;
}

/** Paid invoices in the timeline that had a due date, and how many of them were paid by it. */
export function paidByDueDate(timeline: CustomerInvoiceTimelineEntry[]): { onTime: number; judged: number } {
  const judged = timeline.filter((e) => e.paidOn !== null && e.daysLate !== null);
  return { onTime: judged.filter((e) => e.daysLate === 0).length, judged: judged.length };
}

/** "Both open invoices", "The open invoice", "All 5 open invoices". */
function openInvoicesPhrase(count: number): string {
  if (count === 1) return 'The open invoice';
  if (count === 2) return 'Both open invoices';
  return `All ${count} open invoices`;
}

/**
 * The account's warning, when it needs one: over the credit limit, or
 * something overdue. Null when neither, so no alert shows.
 */
export function accountAlert(summary: CustomerPaymentSummary, distributorCurrency: string): { title: string; detail: string } | null {
  const { credit, overdue, outstanding } = summary;
  if (!credit.overLimit && overdue.count === 0) return null;
  const fmt = makeCurrencyFormatter(credit.used.currency);
  const overdueMoney = formatMoneyAmounts(overdue.amounts, distributorCurrency);

  let title: string;
  if (credit.overLimit && credit.limit) {
    const times = credit.limit.amount > 0 ? ` · ${(credit.used.amount / credit.limit.amount).toFixed(1)}× over` : '';
    title = `${fmt(credit.used.amount)} owed against a ${fmt(credit.limit.amount)} limit${times}`;
  } else {
    title = `${overdueMoney} overdue on ${plural(overdue.count, 'invoice')}`;
  }

  let detail: string;
  if (overdue.count > 0) {
    const oldest = `the oldest is ${plural(overdue.oldestDaysOverdue ?? 0, 'day')} past due`;
    detail = credit.overLimit ? `${overdueMoney} of it is overdue; ${oldest}.` : `${oldest.charAt(0).toUpperCase()}${oldest.slice(1)}.`;
  } else {
    const next = nextPaymentDue(summary.openInvoices, summary.asOf);
    if (!next) detail = 'Nothing is overdue yet.';
    else if (next.count === outstanding.count) detail = `Nothing is overdue yet. ${openInvoicesPhrase(next.count)} fall${next.count === 1 ? 's' : ''} due on ${dayMonth(next.dueDate)}.`;
    else detail = `Nothing is overdue yet. The next payment, ${formatMoneyAmounts(next.amounts, distributorCurrency)}, falls due on ${dayMonth(next.dueDate)}.`;
  }
  return { title, detail };
}
