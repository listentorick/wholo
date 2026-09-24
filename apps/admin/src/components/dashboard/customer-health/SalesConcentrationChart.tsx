'use client';

import { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CustomerHealthSalesConcentration } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { ChartTableFallback } from '../ChartTableFallback';
import { buildSalesConcentrationOption } from './salesConcentrationChartOption';
import { TIER_META, formatShare, salesConcentrationSummary } from './customer-health';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  sales: CustomerHealthSalesConcentration;
  currency: (value: number) => string;
}

// The plot lives in its own component so the chart is created only once there
// is something to draw: useEChart initialises on mount, so a container that
// appears later (sales arriving after an empty first load) would never get one.
function SalesBars({ sales, currency }: Props) {
  const { containerRef, chartRef } = useEChart();

  useEffect(() => {
    chartRef.current?.setOption(buildSalesConcentrationOption(sales.topCustomers, currency), true);
  }, [sales, currency, chartRef]);

  return <div ref={containerRef} role="img" aria-label={salesConcentrationSummary(sales)} className="mt-3 h-44 w-full" />;
}

// Where the money comes from, and how healthy those customers are: a customer
// whose health is slipping is worth the most attention when they are a big
// share of sales. Sales only for now — gross profit needs product costs, which
// Stocdup does not hold yet.
export function SalesConcentrationChart({ sales, currency }: Props) {
  return (
    <section className="rounded-lg border border-border bg-white p-5" aria-labelledby="sales-concentration-heading">
      <h2 id="sales-concentration-heading" className="text-sm font-semibold text-text">Where our sales come from</h2>
      <p className="mt-0.5 text-xs text-muted">Customer sales in the last {sales.periodDays} days.</p>

      {sales.topCustomers.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No sales in the last {sales.periodDays} days.</p>
      ) : (
        <>
          <p className="mt-3 rounded-md bg-canvas px-3 py-2 text-xs text-text">
            Top {sales.topCustomers.length} customers account for <span className="font-semibold text-primary">{formatShare(sales.top5Share)}</span> of sales
          </p>

          <SalesBars sales={sales} currency={currency} />

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
            <span className="text-muted">All other customers</span>
            <span className="text-right">
              <span className="block font-medium tabular-nums text-text">{currency(sales.otherValue)}</span>
              <span className="block tabular-nums text-muted">{formatShare(sales.otherShare)}</span>
            </span>
          </div>

          <p className="mt-3 text-xs text-muted">The dot beside each name is that customer&rsquo;s health: green healthy, orange watch, red at risk.</p>

          <ChartTableFallback
            columns={['Customer', 'Health', 'Sales', 'Share']}
            rows={[
              ...sales.topCustomers.map((c) => [c.customerName, TIER_META[c.tier].label, currency(c.value), formatShare(c.share)]),
              ['All other customers', '—', currency(sales.otherValue), formatShare(sales.otherShare)],
            ]}
          />
        </>
      )}
    </section>
  );
}
