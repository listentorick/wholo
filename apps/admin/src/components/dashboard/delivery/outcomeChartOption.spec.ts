import { describe, it, expect } from 'vitest';
import { OUTCOME_COLOURS, buildOutcomeOption, outcomeSummary, outcomeTooltip } from './outcomeChartOption';
import { outcomeBars } from './delivery';
import { outcomesFixture, overviewFixture } from './fixtures';

const overview = overviewFixture();
const bars = outcomeBars(outcomesFixture().days, overview);

// The option is plain data, so the chart's behaviour is testable without a canvas.
type Series = { name: string; type: string; stack?: string; data: Array<number | null>; itemStyle?: Record<string, unknown>; lineStyle?: Record<string, unknown>; label?: Record<string, unknown> };
const option = () => buildOutcomeOption(bars) as unknown as { series: Series[]; xAxis: { data: string[] }; tooltip: { formatter: (p: unknown) => string } };
const series = (name: string) => option().series.find((s) => s.name === name)!;

describe('buildOutcomeOption', () => {
  it('has a bar for each previous day and one for today, today labelled as such', () => {
    const { data } = option().xAxis;
    expect(data).toHaveLength(8);
    expect(data[0]).toBe('Fri 11');
    expect(data[6]).toBe('Thu 17');
    expect(data[7]).toBe('Today');
  });

  it('puts the weekday over the date so eight labels fit a phone, and marks today in bold', () => {
    const { formatter, rich } = (option().xAxis as unknown as { axisLabel: { formatter: (v: string) => string; rich: Record<string, { fontWeight: number }> } }).axisLabel;
    expect(formatter('Mon 14')).toBe('Mon\n14');
    expect(formatter('Today')).toBe('{today|Today}');
    expect(rich.today.fontWeight).toBe(600);
  });

  it('stacks on time, late, failed and still-to-do into one bar per day', () => {
    const stacked = option().series.filter((s) => s.type === 'bar');
    expect(stacked.map((s) => s.name)).toEqual(['On time', 'Late', 'Failed', 'Still to do (today)']);
    expect(new Set(stacked.map((s) => s.stack)).size).toBe(1);
  });

  it("carries each day's outcome counts, with today's live figures last", () => {
    expect(series('On time').data.at(-1)).toBe(32);
    expect(series('Failed').data.at(-1)).toBe(2);
    expect(series('Still to do (today)').data.at(-1)).toBe(17);
    expect(series('On time').data[2]).toBe(60); // Sun 13
  });

  it('draws nothing (null, not a zero-height sliver) where a segment is empty', () => {
    expect(series('Late').data[1]).toBeNull(); // no late deliveries on Sat 12
    expect(series('Late').data.at(-1)).toBeNull();
    expect(series('Still to do (today)').data.slice(0, 7).every((v) => v === null)).toBe(true); // only today has anything still to do
  });

  it('hatches "still to do" (a decal) and keeps the outcome bars solid', () => {
    expect(series('Still to do (today)').itemStyle?.decal).toMatchObject({ symbol: 'rect' });
    for (const name of ['On time', 'Late', 'Failed']) expect(series(name).itemStyle).not.toHaveProperty('decal');
  });

  it('uses the outcome colours: green on time, amber late, red failed', () => {
    expect(series('On time').itemStyle?.color).toBe(OUTCOME_COLOURS.onTime);
    expect(series('Late').itemStyle?.color).toBe(OUTCOME_COLOURS.late);
    expect(series('Failed').itemStyle?.color).toBe(OUTCOME_COLOURS.failed);
  });

  it('draws the planned total as its own dashed line with numbers, so it stays whatever else is shown', () => {
    const planned = series('Planned');
    expect(planned.type).toBe('line');
    expect(planned.stack).toBeUndefined();
    expect(planned.lineStyle?.type).toBe('dashed');
    expect(planned.label?.show).toBe(true);
    expect(planned.data).toEqual(bars.map((b) => b.total));
    expect(planned.data.at(-1)).toBe(51);
  });

  it('still charts today on a first-ever day with no history', () => {
    const only = buildOutcomeOption(outcomeBars([], overview)) as unknown as { xAxis: { data: string[] } };
    expect(only.xAxis.data).toEqual(['Today']);
  });

  it('shows the hover card for the day under the pointer', () => {
    const html = option().tooltip.formatter([{ dataIndex: 7 }]);
    expect(html).toContain('Fri 18 Sep');
    expect(html).toContain('so far today');
    expect(option().tooltip.formatter({ dataIndex: 0 })).toContain('Fri 11 Sep');
  });

  it('shows nothing for a pointer that is not over a day', () => {
    expect(option().tooltip.formatter([])).toBe('');
    expect(option().tooltip.formatter([{ dataIndex: 99 }])).toBe('');
  });
});

describe('outcomeTooltip', () => {
  const past = bars[4]; // Tue 15: 43 on time, 1 late, 0 failed
  const today = bars.at(-1)!;

  it("gives each outcome its count and share of the day's deliveries, then the planned total", () => {
    const html = outcomeTooltip(bars.find((b) => b.date === '2026-09-14')!); // 58 / 4 / 2 of 64
    expect(html).toContain('Mon 14 Sep');
    expect(html).toContain('58 · 91%');
    expect(html).toContain('4 · 6%');
    expect(html).toContain('2 · 3%');
    expect(html).toMatch(/Planned<\/span><b>64<\/b>/);
  });

  it('only mentions "still to do" for today', () => {
    expect(outcomeTooltip(past)).not.toContain('Still to do');
    expect(outcomeTooltip(today)).toContain('Still to do');
    expect(outcomeTooltip(today)).toContain('17 · 33%');
  });

  it('omits shares, rather than dividing by zero, on a day with nothing planned', () => {
    const empty = { date: '2026-09-18', onTime: 0, late: 0, failed: 0, todo: 0, total: 0, isToday: true };
    const html = outcomeTooltip(empty);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('%');
  });
});

describe('outcomeSummary', () => {
  it('describes every day in words for assistive technology, saying today is in progress', () => {
    const summary = outcomeSummary(bars);
    expect(summary.split('. ')).toHaveLength(8);
    expect(summary).toContain('Fri 18 (today, in progress): 32 on time, 0 late, 2 failed, 17 still to do');
    expect(summary).toContain('Mon 14: 58 on time, 4 late, 2 failed');
  });
});
