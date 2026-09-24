'use client';

import { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CustomerHealthResponse } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { buildHealthTierOption, TIER_COLOURS } from './healthTierChartOption';
import { healthTierSummary } from './customer-health';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

const ITEMS: Array<{ key: keyof CustomerHealthResponse['tierCounts']; label: string; note: string }> = [
  { key: 'healthy', label: 'Healthy', note: 'Buying regularly, no issues' },
  { key: 'watch', label: 'Watch', note: 'Some signs of decline' },
  { key: 'at_risk', label: 'At risk', note: 'Low activity or delivery problems' },
];

export function HealthTierBar({ counts }: { counts: CustomerHealthResponse['tierCounts'] }) {
  const { containerRef, chartRef } = useEChart();

  useEffect(() => {
    chartRef.current?.setOption(buildHealthTierOption(counts), true);
  }, [counts, chartRef]);

  return (
    <section className="rounded-lg border border-border bg-white p-5" aria-labelledby="customer-health-heading">
      <h2 id="customer-health-heading" className="text-sm font-semibold text-text">Customer health</h2>
      <p className="mt-0.5 text-xs text-muted">Buying frequency, order value and delivery experience.</p>

      <div ref={containerRef} role="img" aria-label={healthTierSummary(counts)} className="mt-4 h-4 w-full" />

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {ITEMS.map((item) => (
          <div key={item.key}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_COLOURS[item.key] }} aria-hidden="true" />
              {item.label}
            </dt>
            <dd className="mt-1 text-xl font-semibold text-text">{counts[item.key]}</dd>
            <p className="mt-0.5 text-xs text-muted">{item.note}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}
