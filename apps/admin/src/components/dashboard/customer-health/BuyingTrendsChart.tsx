'use client';

import { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CustomerHealthBuyingTrendWeek } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { ChartLegend } from '../ChartLegend';
import { ChartTableFallback } from '../ChartTableFallback';
import { buildBuyingTrendsOption, TREND_COLOURS } from './buyingTrendsChartOption';
import { buyingTrendsSummary, hasExpectedOrders, shortDate } from './customer-health';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

// The plot lives in its own component so the chart is created only when there
// are weeks to draw — useEChart initialises once on mount, so a container that
// appears later would never get a chart.
function TrendBars({ weeks }: { weeks: CustomerHealthBuyingTrendWeek[] }) {
  const { containerRef, chartRef } = useEChart();

  useEffect(() => {
    chartRef.current?.setOption(buildBuyingTrendsOption(weeks), true);
  }, [weeks, chartRef]);

  return <div ref={containerRef} role="img" aria-label={buyingTrendsSummary(weeks)} className="h-56 w-full" />;
}

export function BuyingTrendsChart({ weeks }: { weeks: CustomerHealthBuyingTrendWeek[] }) {
  const expected = hasExpectedOrders(weeks);

  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <h2 className="text-sm font-semibold text-text">Buying trends</h2>
      <p className="mt-0.5 text-xs text-muted">
        {expected ? `Expected vs. placed orders over the last ${weeks.length} complete weeks.` : `Placed orders over the last ${weeks.length} complete weeks.`}
      </p>

      {weeks.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No data for this period yet.</p>
      ) : (
        <>
          <ChartLegend
            items={[
              { label: 'Placed orders', color: TREND_COLOURS.placed, variant: 'box' },
              ...(expected ? [{ label: 'Expected orders', color: TREND_COLOURS.expected, variant: 'dashed' as const }] : []),
            ]}
          />

          <TrendBars weeks={weeks} />

          {!expected && (
            <p className="mt-2 text-xs text-muted">Expected orders appear once there are 16 weeks of order history to base them on.</p>
          )}

          <ChartTableFallback
            columns={['Week', 'Placed orders', 'Expected orders']}
            rows={weeks.map((w) => [shortDate(w.weekStart), w.placedOrders, w.expectedOrders ?? '—'])}
          />
        </>
      )}
    </section>
  );
}
