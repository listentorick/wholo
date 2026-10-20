import { describe, it, expect } from 'vitest';
import type { CustomerInvoiceTimelineEntry, CustomerPaymentSummary } from '@wholo/types';
import {
  buildOverdueHistoryOption,
  overdueHistorySummary,
  buildExposureOption,
  exposureMax,
  exposureSegments,
  buildInvoiceTimelineOption,
  describeEntry,
  OWED_COLOUR,
  OWED_OVER_COLOUR,
  UNINVOICED_COLOUR,
  UNINVOICED_OVER_COLOUR,
  INVOICE_TIMELINE_MAX,
  invoiceTimelineSummary,
  LATE_COLOUR,
  ORDERED_COLOUR,
  PAID_ON_TIME_COLOUR,
  renderTimelineBar,
  TERMS_COLOUR,
  timelineBars,
  timelineLegend,
  timelineRange,
  exactMoney,
  LATE_TEXT_COLOUR,
  type TimelineBar,
} from './accountChartOptions';

type Series = { data: number[]; itemStyle: { color: string }; name?: string; markLine?: { data: Array<{ xAxis: number }>; label: { formatter: string } } };
const seriesOf = (option: ReturnType<typeof buildExposureOption>) => option.series as Series[];
const maxOf = (option: ReturnType<typeof buildExposureOption>) => (option.xAxis as { max: number }).max;

const credit = (over: Partial<CustomerPaymentSummary['credit']> = {}): CustomerPaymentSummary['credit'] => ({
  limit: { currency: 'GBP', amount: 5000 },
  used: { currency: 'GBP', amount: 3840 },
  available: { currency: 'GBP', amount: 1160 },
  usedPercent: 77,
  overLimit: false,
  ...over,
});

describe('exposure bar', () => {
  const none = { amounts: [], count: 0 };
  const uninvoiced = (amount: number) => ({ amounts: [{ currency: 'GBP', amount }], count: 1 });
  const over = credit({ limit: { currency: 'GBP', amount: 100 }, used: { currency: 'GBP', amount: 482 }, overLimit: true });
  const parts = (c: CustomerPaymentSummary['credit'], n: CustomerPaymentSummary['notYetInvoiced']) =>
    exposureSegments(c, n).map((s) => [s.colour, s.amount]);

  it('draws what is owed, then orders not invoiced, within the limit', () => {
    expect(parts(credit(), uninvoiced(500))).toEqual([
      [OWED_COLOUR, 3840],
      [UNINVOICED_COLOUR, 500],
    ]);
  });

  it('turns everything past the limit red, owed first', () => {
    expect(parts(over, uninvoiced(50))).toEqual([
      [OWED_COLOUR, 100],
      [OWED_OVER_COLOUR, 382],
      [UNINVOICED_OVER_COLOUR, 50],
    ]);
    expect(parts(credit(), uninvoiced(1500))).toEqual([
      [OWED_COLOUR, 3840],
      [UNINVOICED_COLOUR, 1160],
      [UNINVOICED_OVER_COLOUR, 340],
    ]);
  });

  it("counts only orders in the limit's currency", () => {
    expect(parts(credit(), { amounts: [{ currency: 'EUR', amount: 500 }], count: 1 })).toEqual([[OWED_COLOUR, 3840]]);
  });

  it('labels orders not invoiced as something to check in the accounting integration', () => {
    expect(exposureSegments(credit(), uninvoiced(1500)).map((s) => s.label)).toEqual([
      'Owed',
      'Not invoiced — check accounting',
      'Not invoiced, over the limit — check accounting',
    ]);
  });

  it('is as long as whichever is larger, the limit or the total, with no rounding', () => {
    expect(exposureMax(over, uninvoiced(591.16))).toBeCloseTo(1073.16, 2);
    expect(exposureMax(credit(), none)).toBe(5000);
    expect(exposureMax(credit({ limit: null, available: null, usedPercent: null }), none)).toBe(3840);
    const option = buildExposureOption(over, none);
    expect(maxOf(option)).toBe(482);
    expect(seriesOf(option)[0].data).toEqual([482]); // the track
  });

  it('marks the limit', () => {
    const [, first] = seriesOf(buildExposureOption(over, none));
    expect(first.markLine!.data).toEqual([{ xAxis: 100 }]);
    expect(first.markLine!.label.formatter).toBe('Limit £100');
  });

  it('has no limit line without a limit', () => {
    const option = buildExposureOption(credit({ limit: null, available: null, usedPercent: null }), none);
    expect(seriesOf(option).some((s) => s.markLine)).toBe(false);
  });
});

describe('buildOverdueHistoryOption', () => {
  const zero = { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const history = {
    currency: 'GBP',
    since: '2026-10-15',
    days: [
      { date: '2026-10-15', buckets: { ...zero, '1-30': 100 } },
      { date: '2026-10-16', buckets: { ...zero, '1-30': 100, '61-90': 50.5 } },
      { date: '2026-10-17', buckets: { ...zero, '31-60': 40 } },
    ],
  };
  type LineSeries = { name: string; stack: string; areaStyle: object; itemStyle: { color: string }; data: number[] };

  it('stacks one filled band per age, oldest at the bottom, one point a day', () => {
    const option = buildOverdueHistoryOption(history);
    const series = option.series as LineSeries[];
    expect(series.map((s) => s.name)).toEqual(['90+ days', '61–90 days', '31–60 days', '1–30 days']);
    expect(series.every((s) => s.stack === 'overdue' && s.areaStyle)).toBe(true);
    expect(series.find((s) => s.name === '1–30 days')!.data).toEqual([100, 100, 0]);
    expect(series.find((s) => s.name === '61–90 days')!.data).toEqual([0, 50.5, 0]);
    expect((option.xAxis as { data: string[] }).data).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(new Set(series.map((s) => s.itemStyle.color)).size).toBe(4);
  });

  it("gives each day's total and every band in the tooltip", () => {
    const formatter = (buildOverdueHistoryOption(history).tooltip as { formatter: (p: Array<{ dataIndex: number }>) => string }).formatter;
    const html = formatter([{ dataIndex: 1 }]);
    expect(html).toContain('£150.50 overdue');
    expect(html).toContain('1–30 days: £100.00');
    expect(html).toContain('61–90 days: £50.50');
    expect(html).toContain('90+ days: £0.00');
  });

  it('describes the history in words', () => {
    expect(overdueHistorySummary(history)).toBe(
      'Overdue each day from 15 Oct: £100.00 then, £40.00 today (31–60 days £40.00), highest £150.50 on 16 Oct.',
    );
    expect(overdueHistorySummary({ currency: 'GBP', since: null, days: [] })).toBe('No overdue history yet.');
  });
});

describe('buildInvoiceTimelineOption', () => {
  const TODAY = '2026-10-17';
  const entry = (n: number, orderedOn: string | null, paidOn: string | null, daysLate: number | null, dueDate: string | null = null): CustomerInvoiceTimelineEntry => ({
    orderId: `o-${n}`,
    orderNumber: `ORD-${n}`,
    orderedOn,
    dueDate,
    paidOn,
    daysLate,
    currency: 'GBP',
    total: 100,
    amountDue: paidOn ? 0 : 100,
  });
  const ms = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const DAY = 86_400_000;

  const entries = [
    entry(1, '2026-09-01', '2026-09-20', 0, '2026-09-30'),
    entry(2, '2026-09-05', '2026-10-10', 4, '2026-10-06'),
    entry(3, '2026-09-08', null, 9, '2026-10-08'),
    entry(4, '2026-10-01', null, 0, '2026-10-31'),
  ];
  const span = (b: TimelineBar) => [b.entry.orderNumber, b.status, b.ordered, b.due, b.paid, b.end];

  it('gives each invoice its order, due-by and payment dates', () => {
    expect(timelineBars(entries, TODAY).slice(0, 2).map(span)).toEqual([
      ['ORD-1', 'paid-on-time', ms('2026-09-01'), ms('2026-09-30'), ms('2026-09-20'), ms('2026-09-20')],
      ['ORD-2', 'paid-late', ms('2026-09-05'), ms('2026-10-06'), ms('2026-10-10'), ms('2026-10-10')],
    ]);
  });

  it('runs an unpaid invoice to today, overdue or not yet due', () => {
    expect(timelineBars(entries, TODAY).slice(2).map(span)).toEqual([
      ['ORD-3', 'overdue', ms('2026-09-08'), ms('2026-10-08'), null, ms(TODAY)],
      ['ORD-4', 'unpaid', ms('2026-10-01'), ms('2026-10-31'), null, ms(TODAY)],
    ]);
  });

  it('shows every date and today, with room either side', () => {
    const bars = timelineBars(entries, TODAY);
    expect(timelineRange(bars, TODAY)).toEqual({ min: ms('2026-09-01') - 3 * DAY, max: ms('2026-10-31') + 3 * DAY });
    const short = timelineBars([entry(1, '2026-10-15', null, 0)], TODAY);
    expect(timelineRange(short, TODAY)).toEqual({ min: ms('2026-10-15') - 2 * DAY, max: ms(TODAY) + 2 * DAY });
  });

  it('lists only the marks the chart uses', () => {
    const labels = (list: CustomerInvoiceTimelineEntry[]) => timelineLegend(timelineBars(list, TODAY)).map((i) => i.label);
    expect(labels(entries)).toEqual(['Ordered', 'Within terms', 'Due by', 'Late', 'Paid on time', 'Paid late']);
    expect(labels([entry(4, '2026-10-01', null, 0, '2026-10-31')])).toEqual(['Ordered', 'Within terms', 'Due by']);
    expect(labels([entry(5, '2026-10-01', null, null)])).toEqual(['Ordered', 'No due date']);
  });

  it('draws one row per invoice on a date axis, with a line at today', () => {
    const option = buildInvoiceTimelineOption(entries, TODAY);
    expect((option.yAxis as { data: string[] }).data).toEqual(['ORD-1', 'ORD-2', 'ORD-3', 'ORD-4']);
    const [series] = option.series as Array<{ data: Array<{ entry: CustomerInvoiceTimelineEntry }>; markLine: { data: Array<{ xAxis: number }> } }>;
    expect(series.data.map((d) => d.entry.orderNumber)).toEqual(['ORD-1', 'ORD-2', 'ORD-3', 'ORD-4']); // for the tooltip
    expect(series.markLine.data).toEqual([{ xAxis: ms(TODAY) }]);
  });

  describe('each row', () => {
    const shapesFor = (e: CustomerInvoiceTimelineEntry) => {
      const render = renderTimelineBar(timelineBars([e], TODAY));
      const api = { value: () => 0, coord: ([x, y]: [number, number]) => [x / DAY, y] as [number, number] };
      return (render({ dataIndex: 0 }, api) as { children: Array<{ type: string; style: { fill?: string; text?: string } }> }).children;
    };
    const fills = (e: CustomerInvoiceTimelineEntry) =>
      shapesFor(e)
        .filter((c) => c.type !== 'text')
        .map((c) => `${c.type}:${c.style.fill ?? 'none'}`);
    const endLabel = (e: CustomerInvoiceTimelineEntry) => shapesFor(e).find((c) => c.type === 'text')!.style;

    it('paid on time: order dot, terms bar, due-by tick and a green payment dot', () => {
      expect(fills(entries[0])).toEqual([`rect:${TERMS_COLOUR}`, `rect:${ORDERED_COLOUR}`, `circle:${ORDERED_COLOUR}`, `circle:${PAID_ON_TIME_COLOUR}`]);
    });

    it('paid late: the time past the due date is red, and so is the payment dot', () => {
      expect(fills(entries[1])).toEqual([`rect:${TERMS_COLOUR}`, `rect:${LATE_COLOUR}`, `rect:${ORDERED_COLOUR}`, `circle:${ORDERED_COLOUR}`, `circle:${LATE_COLOUR}`]);
    });

    it('unpaid and overdue: red from the due date to today, with no payment dot', () => {
      expect(fills(entries[2])).toEqual([`rect:${TERMS_COLOUR}`, `rect:${LATE_COLOUR}`, `rect:${ORDERED_COLOUR}`, `circle:${ORDERED_COLOUR}`]);
    });

    it('no due date: a dashed line from the order to today', () => {
      expect(fills(entry(5, '2026-10-01', null, null))).toEqual(['line:none', `circle:${ORDERED_COLOUR}`]);
    });

    it('ends in words: how late, on time, how overdue, or when it is due', () => {
      expect(endLabel(entries[0])).toMatchObject({ text: 'On time' });
      expect(endLabel(entries[1])).toMatchObject({ text: '4d late', fill: LATE_TEXT_COLOUR });
      expect(endLabel(entries[2])).toMatchObject({ text: '9d overdue', fill: LATE_TEXT_COLOUR });
      expect(endLabel(entries[3])).toMatchObject({ text: 'Due 31 Oct' });
    });
  });

  it('shows only the most recently ordered invoices', () => {
    const many = Array.from({ length: INVOICE_TIMELINE_MAX + 3 }, (_, i) => entry(i, null, '2026-09-20', 0));
    const option = buildInvoiceTimelineOption(many, TODAY);
    expect((option.yAxis as { data: string[] }).data).toHaveLength(INVOICE_TIMELINE_MAX);
    expect((option.yAxis as { data: string[] }).data[0]).toBe('ORD-3');
  });

  it('describes the timeline in words', () => {
    expect(invoiceTimelineSummary(entries.slice(1, 3))).toBe(
      '2 invoices: 0 paid on time, 1 paid late, 0 not yet due, 1 overdue. ORD-2 £100.00 ordered 5 Sept 2026, paid 10 Oct 2026; ORD-3 £100.00 ordered 8 Sept 2026, not paid.',
    );
  });

  it('shows money exactly, per currency', () => {
    expect(exactMoney([{ currency: 'GBP', amount: 841.5 }, { currency: 'EUR', amount: 80 }])).toBe('£841.50 + €80.00');
  });
});

describe('describeEntry', () => {
  it('gives the invoice amount, and what is still owed on a part-paid one', () => {
    const base = { orderId: 'o', orderNumber: 'ORD-1', orderedOn: '2026-10-10', dueDate: '2026-11-30', paidOn: null, daysLate: 0, currency: 'GBP' };
    expect(describeEntry({ ...base, total: 841.5, amountDue: 841.5 })).toContain('ORD-1</strong> · £841.50');
    expect(describeEntry({ ...base, total: 841.5, amountDue: 300 })).toContain('£300.00 owed of £841.50');
  });

  it('escapes the order number in the HTML tooltip', () => {
    const html = describeEntry({
      orderId: 'o',
      orderNumber: '<img src=x onerror=alert(1)>',
      orderedOn: null,
      dueDate: null,
      paidOn: null,
      daysLate: null,
      currency: 'GBP',
      total: 10,
      amountDue: 10,
    });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });
});
