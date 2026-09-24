import { describe, it, expect } from 'vitest';
import { buildBuyingTrendsOption, TREND_COLOURS } from './buyingTrendsChartOption';

type BarSeries = { name: string; type: 'bar'; data: number[]; itemStyle: { color: string } };
type LineSeries = { name: string; type: 'line'; data: number[]; lineStyle: { type: string; color: string } };
const weeks = [
  { weekStart: '2026-08-03', expectedOrders: 120, placedOrders: 98 },
  { weekStart: '2026-08-10', expectedOrders: 120, placedOrders: 165 },
];

describe('buildBuyingTrendsOption', () => {
  it('plots placed orders as bars and expected orders as a dashed reference line', () => {
    const option = buildBuyingTrendsOption(weeks) as unknown as { series: [BarSeries, LineSeries]; xAxis: { data: string[] } };

    expect(option.series[0]).toMatchObject({ name: 'Placed orders', type: 'bar', data: [98, 165], itemStyle: { color: TREND_COLOURS.placed } });
    expect(option.series[1]).toMatchObject({ name: 'Expected orders', type: 'line', data: [120, 120] });
    expect(option.series[1].lineStyle.type).toBe('dashed');
    expect(option.series[1].lineStyle.color).toBe(TREND_COLOURS.expected);
  });

  it('labels the x-axis with a short date per week', () => {
    const option = buildBuyingTrendsOption(weeks) as unknown as { xAxis: { data: string[] } };
    expect(option.xAxis.data).toEqual(['3 Aug', '10 Aug']);
  });

  it('draws the bars alone, never a flat zero line, when there is no baseline to expect against', () => {
    const noBaseline = weeks.map((w) => ({ ...w, expectedOrders: null }));
    const option = buildBuyingTrendsOption(noBaseline) as unknown as { series: Array<{ name: string }> };

    expect(option.series.map((x) => x.name)).toEqual(['Placed orders']);
  });
});
