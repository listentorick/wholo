import type { EChartsCoreOption } from 'echarts/core';
import {
  getCurrencySymbol,
  type CustomerInvoiceTimelineEntry,
  type CustomerOverdueHistory,
  type CustomerPaymentSummary,
  type MoneyAmount,
  type OverdueAgeingBucket,
} from '@wholo/types';
import { makeCurrencyFormatter } from '../currency';
import { axisLabelStyle, BORDER_COLOR, chartTooltip, MUTED_COLOR, splitLineStyle, TEXT_COLOR } from '../chart-theme';
import { AGEING_META, plural, shortDate } from './customer-account';

export const OWED_COLOUR = '#24376B';
export const OWED_OVER_COLOUR = '#C8242B';
export const UNINVOICED_COLOUR = '#8FA8DD';
export const UNINVOICED_OVER_COLOUR = '#F1A5A8';

/** One coloured stretch of the exposure bar. */
export interface ExposureSegment {
  key: 'owed' | 'owed-over' | 'uninvoiced' | 'uninvoiced-over';
  label: string;
  colour: string;
  amount: number;
}

/**
 * What the customer owes, then accepted orders the accounting system has no
 * invoice for yet, split at the credit limit: anything past the limit is red.
 * Orders are invoiced as soon as they are accepted, so an uninvoiced one means
 * the export failed or stalled; the label says to check the accounting
 * integration. Only the distributor's currency counts, as the limit is in it.
 * Empty segments are left out.
 */
export function exposureSegments(credit: CustomerPaymentSummary['credit'], notYetInvoiced: CustomerPaymentSummary['notYetInvoiced']): ExposureSegment[] {
  const owed = credit.used.amount;
  const uninvoiced = notYetInvoiced.amounts.find((a) => a.currency === credit.used.currency)?.amount ?? 0;
  const limit = credit.limit?.amount ?? Infinity;
  const owedWithin = Math.min(owed, limit);
  const uninvoicedWithin = Math.min(uninvoiced, Math.max(0, limit - owed));
  const segments: ExposureSegment[] = [
    { key: 'owed', label: 'Owed', colour: OWED_COLOUR, amount: owedWithin },
    { key: 'owed-over', label: 'Owed over the limit', colour: OWED_OVER_COLOUR, amount: owed - owedWithin },
    { key: 'uninvoiced', label: 'Not invoiced — check accounting', colour: UNINVOICED_COLOUR, amount: uninvoicedWithin },
    { key: 'uninvoiced-over', label: 'Not invoiced, over the limit — check accounting', colour: UNINVOICED_OVER_COLOUR, amount: uninvoiced - uninvoicedWithin },
  ];
  return segments.filter((s) => s.amount > 0);
}

/** The bar is as long as whichever is larger, the limit or everything owed and not yet invoiced. */
export function exposureMax(credit: CustomerPaymentSummary['credit'], notYetInvoiced: CustomerPaymentSummary['notYetInvoiced']): number {
  const total = exposureSegments(credit, notYetInvoiced).reduce((sum, s) => sum + s.amount, 0);
  return Math.max(total, credit.limit?.amount ?? 0) || 1;
}

/**
 * The exposure bar: stacked segments on a pale track, with the credit limit
 * as a dark upright line labelled above. No axis chrome; the figures and
 * legend beside it carry the numbers, so colour never carries the meaning alone.
 */
export function buildExposureOption(credit: CustomerPaymentSummary['credit'], notYetInvoiced: CustomerPaymentSummary['notYetInvoiced']): EChartsCoreOption {
  const segments = exposureSegments(credit, notYetInvoiced);
  const max = exposureMax(credit, notYetInvoiced);
  const fmt = makeCurrencyFormatter(credit.used.currency);
  const limit = credit.limit?.amount ?? null;
  // Keep the limit's label inside the chart when the line is near either end.
  const at = limit === null ? 0 : limit / max;
  const align = at < 0.15 ? 'left' : at > 0.85 ? 'right' : 'center';
  return {
    grid: { top: 20, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'value', show: false, min: 0, max },
    yAxis: { type: 'category', show: false, data: [''] },
    series: [
      // The track: the full length of the bar, behind the segments.
      { type: 'bar', data: [max], barWidth: 12, barGap: '-100%', silent: true, itemStyle: { color: BORDER_COLOR, borderRadius: 6 }, z: 1 },
      ...segments.map((segment, i) => ({
        name: segment.label,
        type: 'bar' as const,
        stack: 'exposure',
        data: [segment.amount],
        barWidth: 12,
        silent: true,
        z: 2,
        itemStyle: {
          color: segment.colour,
          borderRadius: [i === 0 ? 6 : 0, i === segments.length - 1 ? 6 : 0, i === segments.length - 1 ? 6 : 0, i === 0 ? 6 : 0],
        },
        ...(i === 0 && limit !== null
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: TEXT_COLOR, type: 'solid', width: 2 },
                label: { formatter: `Limit ${fmt(limit)}`, position: 'end', align, color: TEXT_COLOR, fontSize: 12, fontWeight: 600, distance: 2 },
                data: [{ xAxis: limit }],
              },
            }
          : {}),
      })),
    ],
  };
}

/** Oldest band first, so it sits at the bottom of the stack. */
const HISTORY_STACK_ORDER: OverdueAgeingBucket[] = ['90+', '61-90', '31-60', '1-30'];

const historyDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dayMs(iso));
const dayTotal = (day: CustomerOverdueHistory['days'][number]) => HISTORY_STACK_ORDER.reduce((sum, b) => sum + day.buckets[b], 0);

/**
 * What was overdue at the end of each day, as filled areas stacked by days
 * past due: the oldest band at the bottom, darkest. The legend beside the
 * chart names each band with today's amount, and the tooltip lists every band
 * with the day's total, so colour never carries the meaning alone.
 */
export function buildOverdueHistoryOption(history: CustomerOverdueHistory): EChartsCoreOption {
  const money = (amount: number) => exactMoney([{ currency: history.currency, amount }]);
  const wholeMoney = makeCurrencyFormatter(history.currency);
  return {
    // Room on the right for half of the last date label, which centres on the chart's edge.
    grid: { top: 12, right: 24, bottom: 24, left: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: history.days.map((d) => d.date),
      axisLabel: { formatter: historyDate, hideOverlap: true, ...axisLabelStyle, fontSize: 11 },
      axisLine: { lineStyle: { color: BORDER_COLOR } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { formatter: wholeMoney, ...axisLabelStyle, fontSize: 11 },
      splitLine: splitLineStyle,
    },
    tooltip: {
      trigger: 'axis',
      ...chartTooltip,
      formatter: (params: Array<{ dataIndex: number }>) => {
        const day = history.days[params[0]?.dataIndex ?? 0];
        if (!day) return '';
        const rows = [...HISTORY_STACK_ORDER].reverse().map((b) => `${AGEING_META[b].label}: ${money(day.buckets[b])}`);
        return [`<strong>${historyDate(day.date)} · ${money(dayTotal(day))} overdue</strong>`, ...rows].join('<br/>');
      },
    },
    series: HISTORY_STACK_ORDER.map((bucket) => ({
      name: AGEING_META[bucket].label,
      type: 'line' as const,
      stack: 'overdue',
      symbol: 'none',
      lineStyle: { width: 1, color: AGEING_META[bucket].colour },
      itemStyle: { color: AGEING_META[bucket].colour },
      areaStyle: { color: AGEING_META[bucket].colour, opacity: 0.85 },
      data: history.days.map((d) => d.buckets[bucket]),
    })),
  };
}

/** The overdue history in words, for screen readers. */
export function overdueHistorySummary(history: CustomerOverdueHistory): string {
  const money = (amount: number) => exactMoney([{ currency: history.currency, amount }]);
  const first = history.days[0];
  const last = history.days.at(-1);
  if (!first || !last) return 'No overdue history yet.';
  const peak = history.days.reduce((max, d) => (dayTotal(d) > dayTotal(max) ? d : max), first);
  const today = [...HISTORY_STACK_ORDER]
    .reverse()
    .filter((b) => last.buckets[b] > 0)
    .map((b) => `${AGEING_META[b].label} ${money(last.buckets[b])}`);
  return (
    `Overdue each day from ${historyDate(first.date)}: ${money(dayTotal(first))} then, ${money(dayTotal(last))} today` +
    (today.length > 0 ? ` (${today.join(', ')})` : '') +
    `, highest ${money(dayTotal(peak))} on ${historyDate(peak.date)}.`
  );
}

export const ORDERED_COLOUR = '#24376B';
export const TERMS_COLOUR = '#B9CCF2';
export const PAID_ON_TIME_COLOUR = '#16A34A';
export const LATE_COLOUR = '#C8242B';
/** The end-of-row label of an invoice paid late or overdue: a darker red, so small text keeps its contrast. */
export const LATE_TEXT_COLOUR = '#8A1419';
export const NO_TERMS_COLOUR = '#94A3B8';
/** The timeline shows the most recently ordered invoices only, so the card stays a readable height. */
export const INVOICE_TIMELINE_MAX = 12;

export type TimelineStatus = 'paid-on-time' | 'paid-late' | 'unpaid' | 'overdue';

const DAY_MS = 86_400_000;
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const tickDate = (ms: number) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(ms);

export function timelineStatus(entry: CustomerInvoiceTimelineEntry): TimelineStatus {
  const late = (entry.daysLate ?? 0) > 0;
  if (entry.paidOn) return late ? 'paid-late' : 'paid-on-time';
  return late ? 'overdue' : 'unpaid';
}

/** The invoices the timeline draws: the most recently ordered, oldest first. */
export function timelineInvoices(entries: CustomerInvoiceTimelineEntry[]): CustomerInvoiceTimelineEntry[] {
  return entries.slice(-INVOICE_TIMELINE_MAX);
}

/** One invoice's dates, as midnight-UTC ms. */
export interface TimelineBar {
  entry: CustomerInvoiceTimelineEntry;
  status: TimelineStatus;
  ordered: number | null;
  due: number | null;
  paid: number | null;
  /** Where the invoice stands now: its payment date, or today while unpaid. */
  end: number;
}

export function timelineBars(entries: CustomerInvoiceTimelineEntry[], today: string): TimelineBar[] {
  return timelineInvoices(entries).map((entry) => {
    const paid = entry.paidOn ? dayMs(entry.paidOn) : null;
    return {
      entry,
      status: timelineStatus(entry),
      ordered: entry.orderedOn ? dayMs(entry.orderedOn) : null,
      due: entry.dueDate ? dayMs(entry.dueDate) : null,
      paid,
      end: paid ?? dayMs(today),
    };
  });
}

/** The date range the axis shows: every date and today, with a little room either side. */
export function timelineRange(bars: TimelineBar[], today: string): { min: number; max: number } {
  const dates = [dayMs(today), ...bars.flatMap((b) => [b.ordered, b.due, b.end].filter((d): d is number => d !== null))];
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const pad = Math.max(2 * DAY_MS, Math.round(((max - min) * 0.05) / DAY_MS) * DAY_MS);
  return { min: min - pad, max: max + pad };
}

/** Exact money, pence included ("£841.50"); amounts in more than one currency are joined with "+". */
export function exactMoney(amounts: MoneyAmount[]): string {
  return amounts
    .map((a) => `${getCurrencySymbol(a.currency)}${a.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' + ');
}

export interface TimelineLegendItem {
  label: string;
  colour: string;
  variant: 'dot' | 'box' | 'tick' | 'dashed';
}

/** The legend for what the bars actually show, in reading order. Text names each mark, so colour never carries the meaning alone. */
export function timelineLegend(bars: TimelineBar[]): TimelineLegendItem[] {
  const any = (test: (b: TimelineBar) => boolean) => bars.some(test);
  const items: Array<TimelineLegendItem | false> = [
    any((b) => b.ordered !== null) && { label: 'Ordered', colour: ORDERED_COLOUR, variant: 'dot' },
    any((b) => b.ordered !== null && b.due !== null) && { label: 'Within terms', colour: TERMS_COLOUR, variant: 'box' },
    any((b) => b.due !== null) && { label: 'Due by', colour: ORDERED_COLOUR, variant: 'tick' },
    any((b) => b.status === 'paid-late' || b.status === 'overdue') && { label: 'Late', colour: LATE_COLOUR, variant: 'box' },
    any((b) => b.status === 'paid-on-time') && { label: 'Paid on time', colour: PAID_ON_TIME_COLOUR, variant: 'dot' },
    any((b) => b.status === 'paid-late') && { label: 'Paid late', colour: LATE_COLOUR, variant: 'dot' },
    any((b) => b.due === null) && { label: 'No due date', colour: NO_TERMS_COLOUR, variant: 'dashed' },
  ];
  return items.filter((i): i is TimelineLegendItem => i !== false);
}

// The tooltip is HTML, so text from the data is escaped before it goes in.
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function describeEntry(entry: CustomerInvoiceTimelineEntry): string {
  const days = (n: number) => plural(n, 'day');
  const outcome = entry.paidOn
    ? `Paid ${shortDate(entry.paidOn)} (${entry.daysLate === null ? 'no due date' : entry.daysLate > 0 ? `${days(entry.daysLate)} late` : 'on time'})`
    : entry.daysLate && entry.daysLate > 0
      ? `Not paid · ${days(entry.daysLate)} overdue`
      : 'Not paid yet';
  const money = (amount: number) => exactMoney([{ currency: entry.currency, amount }]);
  const amount = entry.paidOn || entry.amountDue === entry.total ? money(entry.total) : `${money(entry.amountDue)} owed of ${money(entry.total)}`;
  return [
    `<strong>${escapeHtml(entry.orderNumber)}</strong> · ${amount}`,
    `Ordered ${shortDate(entry.orderedOn)}`,
    `Due by ${shortDate(entry.dueDate)}`,
    outcome,
  ].join('<br/>');
}

const BAR_HEIGHT = 6;
const DUE_TICK_HEIGHT = 14;

/** The words at the end of a row: how late it was paid, that it was on time, how overdue it is, or when it is due. */
export function timelineEndLabel(bar: TimelineBar): string {
  const days = bar.entry.daysLate ?? 0;
  switch (bar.status) {
    case 'paid-late':
      return `${days}d late`;
    case 'paid-on-time':
      return bar.due === null ? 'Paid' : 'On time';
    case 'overdue':
      return `${days}d overdue`;
    case 'unpaid':
      return bar.due === null ? 'Not paid' : `Due ${tickDate(bar.due)}`;
  }
}

interface RenderApi {
  value: (dim: number) => number;
  coord: (point: [number, number]) => [number, number];
}

/**
 * Draws one invoice. The payment terms are a pale bar from the order date to
 * the due date, ending in a dark "due by" tick. Any time past the due date
 * (paid late, or unpaid and overdue up to today) is red. The order is a dark
 * dot, and a payment is a green (on time) or red (late) dot. Without a due
 * date, a grey dashed line runs from the order to the payment, or to today.
 * The row ends in words: how late, on time, or when due.
 */
export function renderTimelineBar(bars: TimelineBar[]) {
  return (params: { dataIndex: number }, api: RenderApi) => {
    const bar = bars[params.dataIndex];
    const row = api.value(0);
    const x = (ms: number) => api.coord([ms, row])[0];
    const y = api.coord([bar.end, row])[1];
    const segment = (from: number, to: number, fill: string) => ({
      type: 'rect',
      shape: { x: x(from), y: y - BAR_HEIGHT / 2, width: Math.max(x(to) - x(from), 2), height: BAR_HEIGHT, r: BAR_HEIGHT / 2 },
      style: { fill },
    });
    const dot = (ms: number, fill: string, r: number) => ({
      type: 'circle',
      shape: { cx: x(ms), cy: y, r },
      style: { fill, stroke: '#ffffff', lineWidth: 1.5 },
      z2: 10,
    });
    const children: object[] = [];
    if (bar.due === null) {
      if (bar.ordered !== null) {
        children.push({
          type: 'line',
          shape: { x1: x(bar.ordered), y1: y, x2: x(bar.end), y2: y },
          style: { stroke: NO_TERMS_COLOUR, lineWidth: 2, lineDash: [4, 4] },
        });
      }
    } else {
      if (bar.ordered !== null && bar.ordered < bar.due) children.push(segment(bar.ordered, bar.due, TERMS_COLOUR));
      if (bar.end > bar.due) children.push(segment(bar.due, bar.end, LATE_COLOUR));
      children.push({
        type: 'rect',
        shape: { x: x(bar.due) - 1, y: y - DUE_TICK_HEIGHT / 2, width: 2, height: DUE_TICK_HEIGHT, r: 1 },
        style: { fill: ORDERED_COLOUR },
        z2: 5,
      });
    }
    if (bar.ordered !== null) children.push(dot(bar.ordered, ORDERED_COLOUR, 4.5));
    if (bar.paid !== null) children.push(dot(bar.paid, bar.status === 'paid-late' ? LATE_COLOUR : PAID_ON_TIME_COLOUR, 5.5));
    const late = bar.status === 'paid-late' || bar.status === 'overdue';
    children.push({
      type: 'text',
      x: x(Math.max(bar.end, bar.due ?? bar.end)) + 10,
      y,
      style: {
        text: timelineEndLabel(bar),
        fill: late ? LATE_TEXT_COLOUR : MUTED_COLOR,
        fontSize: 11,
        fontWeight: late ? 600 : 400,
        verticalAlign: 'middle',
        // A white box behind the words: the Today line runs beneath (markLine z 1), never through them.
        backgroundColor: '#ffffff',
        padding: [1, 3],
      },
      z2: 10,
    });
    return { type: 'group', children };
  };
}

/**
 * One row per raised invoice, oldest first, on a date axis: when it was
 * ordered, when it was due by under its payment terms, and when (or whether) it
 * was paid, with a line at today.
 */
export function buildInvoiceTimelineOption(entries: CustomerInvoiceTimelineEntry[], today: string): EChartsCoreOption {
  const bars = timelineBars(entries, today);
  const { min, max } = timelineRange(bars, today);
  return {
    // Room on the right for the end-of-row words ("71d late").
    grid: { top: 20, right: 76, bottom: 28, left: 8, containLabel: true },
    xAxis: {
      type: 'time',
      min,
      max,
      axisLabel: { formatter: tickDate, hideOverlap: true, ...axisLabelStyle, fontSize: 11, margin: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, ...splitLineStyle },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: bars.map((b) => b.entry.orderNumber),
      axisLabel: { ...axisLabelStyle, fontSize: 11, color: TEXT_COLOR, margin: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    tooltip: {
      trigger: 'item',
      ...chartTooltip,
      formatter: (params: { data?: { entry?: CustomerInvoiceTimelineEntry } }) => (params.data?.entry ? describeEntry(params.data.entry) : ''),
    },
    series: [
      {
        name: 'Invoices',
        type: 'custom',
        renderItem: renderTimelineBar(bars),
        encode: { x: [1, 2], y: 0 },
        data: bars.map((b, i) => ({ value: [i, b.ordered ?? b.end, b.end], entry: b.entry })),
        markLine: {
          silent: true,
          symbol: 'none',
          // Under the rows (the series is z 2), so the line never crosses a row's words.
          z: 1,
          lineStyle: { color: TEXT_COLOR, type: 'dashed', width: 1.5 },
          // The y axis runs top-down (inverse), so 'start' puts the label above the rows.
          label: { formatter: 'Today', position: 'start', distance: 4, color: TEXT_COLOR, fontSize: 11, fontWeight: 600 },
          data: [{ xAxis: dayMs(today) }],
        },
      },
    ],
  };
}

/** The timeline in words, for screen readers. */
export function invoiceTimelineSummary(entries: CustomerInvoiceTimelineEntry[]): string {
  const rows = timelineInvoices(entries);
  const count = (status: TimelineStatus) => rows.filter((e) => timelineStatus(e) === status).length;
  const scope = rows.length < entries.length ? `The latest ${rows.length} of ${entries.length} invoices` : plural(rows.length, 'invoice');
  const each = rows.map(
    (e) => `${e.orderNumber} ${exactMoney([{ currency: e.currency, amount: e.total }])} ordered ${shortDate(e.orderedOn)}, ${e.paidOn ? `paid ${shortDate(e.paidOn)}` : 'not paid'}`,
  );
  return `${scope}: ${count('paid-on-time')} paid on time, ${count('paid-late')} paid late, ${count('unpaid')} not yet due, ${count('overdue')} overdue. ${each.join('; ')}.`;
}
