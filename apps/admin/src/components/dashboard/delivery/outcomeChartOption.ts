import type { EChartsCoreOption } from 'echarts/core';
import { TEXT_COLOR, axisLabelStyle, axisLineStyle, chartTooltip, splitLineStyle } from '../chart-theme';
import { OutcomeBar, dayLabel, shortDate } from './delivery';

// (The hatch on "still to do" is a per-series decal; ECharts applies it in core, and only to a series that sets one.)
// Wholo's outcome colours: green delivered on the day, amber late, red failed.
// Colour never carries the meaning alone — the legend, tooltip and the "View as
// table" fallback name every series.
export const OUTCOME_COLOURS = { onTime: '#16A34A', late: '#F2864D', failed: '#DC2626', todo: '#B9C7DC', planned: TEXT_COLOR };

const label = (bar: OutcomeBar) => (bar.isToday ? 'Today' : dayLabel(bar.date));
const share = (n: number, total: number) => (total > 0 ? ` · ${Math.round((100 * n) / total)}%` : '');

/** One sentence per day, for screen readers (the plot itself is canvas). */
export function outcomeSummary(bars: OutcomeBar[]): string {
  return bars
    .map((b) => `${dayLabel(b.date)}${b.isToday ? ' (today, in progress)' : ''}: ${b.onTime} on time, ${b.late} late, ${b.failed} failed${b.isToday ? `, ${b.todo} still to do` : ''}`)
    .join('. ');
}

/** The hover card for one day: each outcome with its share, then the planned total. */
export function outcomeTooltip(bar: OutcomeBar): string {
  const row = (colour: string, name: string, n: number, hatch = false) =>
    `<div style="display:flex;justify-content:space-between;gap:16px;padding:1px 0">` +
    `<span style="display:inline-flex;align-items:center;gap:6px"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${hatch ? `repeating-linear-gradient(45deg,#EEF3FB 0 3px,${colour} 3px 5px)` : colour}"></i>${name}</span>` +
    `<b>${n}${share(n, bar.total)}</b></div>`;
  const weekday = dayLabel(bar.date).split(' ')[0];
  return (
    `<div style="min-width:190px"><div style="font-weight:600;margin-bottom:6px">${weekday} ${shortDate(bar.date)}${bar.isToday ? ' · so far today' : ''}</div>` +
    row(OUTCOME_COLOURS.onTime, 'On time', bar.onTime) +
    row(OUTCOME_COLOURS.late, 'Late', bar.late) +
    row(OUTCOME_COLOURS.failed, 'Failed', bar.failed) +
    (bar.isToday ? row(OUTCOME_COLOURS.todo, 'Still to do', bar.todo, true) : '') +
    `<div style="height:1px;background:#E6ECF2;margin:6px 0"></div>` +
    `<div style="display:flex;justify-content:space-between"><span>Planned</span><b>${bar.total}</b></div></div>`
  );
}

// A zero is `null` so a stacked segment with nothing in it draws nothing (not a sliver).
const nz = (n: number) => (n === 0 ? null : n);

/**
 * Each bar is everything planned for that day, split by what happened. Previous
 * days come from delivery facts; today is live, with what is still to do hatched.
 * The dashed line is the planned total (its own series, so it stays put and keeps
 * its numbers whatever else is shown).
 */
export function buildOutcomeOption(bars: OutcomeBar[]): EChartsCoreOption {
  const stacked = (name: string, colour: string, data: Array<number | null>, extra: Record<string, unknown> = {}) => ({
    name,
    type: 'bar',
    stack: 'outcome',
    barMaxWidth: 44,
    data,
    itemStyle: { color: colour, ...extra },
  });

  return {
    grid: { top: 28, right: 8, bottom: 24, left: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: bars.map(label),
      axisLabel: { ...axisLabelStyle, fontSize: 11, interval: 0, // weekday over date, so eight labels fit a phone
        formatter: (v: string) => (v === 'Today' ? '{today|Today}' : v.replace(' ', '\n')), rich: { today: { fontWeight: 600, color: TEXT_COLOR, fontSize: 11 } } },
      axisLine: axisLineStyle,
      axisTick: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, axisLabel: axisLabelStyle, splitLine: splitLineStyle },
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const first = (Array.isArray(params) ? params[0] : params) as { dataIndex: number } | undefined;
        const bar = first ? bars[first.dataIndex] : undefined;
        return bar ? outcomeTooltip(bar) : '';
      },
    },
    series: [
      stacked('On time', OUTCOME_COLOURS.onTime, bars.map((b) => nz(b.onTime))),
      stacked('Late', OUTCOME_COLOURS.late, bars.map((b) => nz(b.late))),
      stacked('Failed', OUTCOME_COLOURS.failed, bars.map((b) => nz(b.failed))),
      stacked('Still to do (today)', '#EEF3FB', bars.map((b) => nz(b.todo)), {
        borderColor: OUTCOME_COLOURS.todo,
        borderWidth: 1,
        decal: { symbol: 'rect', symbolSize: 1, rotation: Math.PI / 4, dashArrayX: [1, 0], dashArrayY: [2, 4], color: OUTCOME_COLOURS.todo },
      }),
      {
        name: 'Planned',
        type: 'line',
        z: 3,
        data: bars.map((b) => b.total),
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { type: 'dashed', width: 1.5, color: OUTCOME_COLOURS.planned },
        itemStyle: { color: '#ffffff', borderColor: OUTCOME_COLOURS.planned, borderWidth: 1.5 },
        label: { show: true, position: 'top', color: TEXT_COLOR, fontSize: 11, fontWeight: 600 },
      },
    ],
  };
}
