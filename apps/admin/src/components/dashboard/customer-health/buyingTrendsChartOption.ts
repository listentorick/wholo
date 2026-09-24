import type { EChartsCoreOption } from 'echarts/core';
import type { CustomerHealthBuyingTrendWeek } from '@wholo/types';
import { MUTED_COLOR, axisLabelStyle, axisLineStyle, chartTooltip, splitLineStyle } from '../chart-theme';
import { hasExpectedOrders, shortDate } from './customer-health';

// Placed orders as bars (the actual); expected as a dashed reference line —
// the same "actual bars, planned dashed line" shape as the Delivery
// dashboard's outcome chart (outcomeChartOption.ts), reused here for
// consistency across the two dashboards' charts.
export const TREND_COLOURS = { placed: '#1565FF', expected: MUTED_COLOR };

export function buildBuyingTrendsOption(weeks: CustomerHealthBuyingTrendWeek[]): EChartsCoreOption {
  // No baseline yet means nothing to expect: draw the bars alone, never a flat zero line.
  const expectedSeries = hasExpectedOrders(weeks)
    ? [
        {
          name: 'Expected orders',
          type: 'line',
          data: weeks.map((w) => w.expectedOrders),
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { type: 'dashed', width: 1.5, color: TREND_COLOURS.expected },
          itemStyle: { color: '#ffffff', borderColor: TREND_COLOURS.expected, borderWidth: 1.5 },
        },
      ]
    : [];

  return {
    grid: { top: 24, right: 8, bottom: 24, left: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: weeks.map((w) => shortDate(w.weekStart)),
      axisLabel: axisLabelStyle,
      axisLine: axisLineStyle,
      axisTick: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, axisLabel: axisLabelStyle, splitLine: splitLineStyle },
    tooltip: { ...chartTooltip, trigger: 'axis' },
    series: [
      { name: 'Placed orders', type: 'bar', barMaxWidth: 36, data: weeks.map((w) => w.placedOrders), itemStyle: { color: TREND_COLOURS.placed } },
      ...expectedSeries,
    ],
  };
}
