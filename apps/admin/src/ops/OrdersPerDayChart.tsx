'use client';

import { useEffect, useMemo } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { PlatformStats } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { ChartLegend } from '@/components/dashboard/ChartLegend';
import { ChartTableFallback } from '@/components/dashboard/ChartTableFallback';
import { axisLabelStyle, axisLineStyle, chartTooltip, splitLineStyle } from '@/components/dashboard/chart-theme';
import { ordersSeries } from './shaping';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

// Cobalt Blue, the admin app's primary (theme.css) — one series, so the legend
// and the table view carry its meaning, not colour.
const ORDERS_COLOR = '#1565FF';
const SERIES_LABEL = 'Orders placed';

const tickDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
// Anchored to local midnight: these are calendar days, not instants.
function formatTickDate(isoDate: string): string {
  return tickDate.format(new Date(`${isoDate}T00:00:00`));
}

export function OrdersPerDayChart({ stats }: { stats: Pick<PlatformStats, 'ordersPerDay'> }) {
  const { containerRef, chartRef } = useEChart();
  const { dates, orders } = useMemo(() => ordersSeries(stats), [stats]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({
      color: [ORDERS_COLOR],
      grid: { top: 16, right: 0, bottom: 28, left: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { formatter: formatTickDate, ...axisLabelStyle },
        axisLine: axisLineStyle,
        axisTick: { show: false },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: axisLabelStyle, splitLine: splitLineStyle },
      tooltip: { trigger: 'axis', ...chartTooltip },
      series: [{ name: SERIES_LABEL, type: 'bar', data: orders, barMaxWidth: 14, itemStyle: { borderRadius: [2, 2, 0, 0] } }],
    });
  }, [dates, orders, chartRef]);

  const total = orders.reduce((sum, n) => sum + n, 0);

  return (
    <div>
      <ChartLegend items={[{ label: SERIES_LABEL, color: ORDERS_COLOR, variant: 'box' }]} />
      <div
        ref={containerRef}
        role="img"
        aria-label={`Orders placed per day across all wholesalers, last ${dates.length} days: ${total} in total`}
        className="h-56 w-full"
      />
      <ChartTableFallback columns={['Date', SERIES_LABEL]} rows={dates.map((d, i) => [d, String(orders[i])])} />
    </div>
  );
}
