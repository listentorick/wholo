'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { OrderTrendPoint } from '@wholo/types';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  current: OrderTrendPoint[];
  comparison: OrderTrendPoint[];
  comparisonLabel: string;
}

// Wholo's own brand pair (Cobalt Blue / Amber) — validated via the dataviz
// skill's six-checks script (worst-pair CVD ΔE 31.5 light, normal-vision
// ΔE 40.8), rather than the skill's generic default palette, for
// consistency with the rest of the app's branding. Amber's contrast vs. the
// white chart surface falls below 3:1 (a documented WARN), which is why
// this chart never relies on color alone: the legend and end-label carry
// the series name/value in text too.
const CURRENT_COLOR = '#1565FF';
const COMPARISON_COLOR = '#F2864D';

// Design tokens (apps/admin/src/styles/theme.css) resolved to literal hex —
// canvas rendering can't resolve CSS custom properties.
const MUTED_COLOR = '#5B6B7F';
const TEXT_COLOR = '#0B1D3A';
const BORDER_COLOR = '#E6ECF2';

function formatCurrency(value: number): string {
  return `£${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

const tickDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
// The `T00:00:00` suffix keeps parsing anchored to the local calendar day —
// OrderTrendPoint.date is always a zero-filled daily bucket (see
// apps/api/src/analytics/analytics.service.ts), and without it
// `new Date('2026-03-15')` parses as UTC midnight, which renders as the
// previous day in any timezone behind UTC.
function formatTickDate(isoDate: string): string {
  return tickDateFormatter.format(new Date(`${isoDate}T00:00:00`));
}

export function OrderTrendChart({ current, comparison, comparisonLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Chart lifecycle — init once, resize on container changes, dispose on
  // unmount. Kept separate from the data-driven effect below so resizing
  // never re-creates the chart instance.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el);
    chartRef.current = chart;

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => chart.resize());
      resizeObserver.observe(el);
    }

    return () => {
      resizeObserver?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.setOption({
      color: [CURRENT_COLOR, COMPARISON_COLOR],
      grid: { top: 16, right: 64, bottom: 28, left: 56, containLabel: true },
      xAxis: {
        type: 'category',
        data: current.map((p) => p.date),
        axisLabel: { formatter: formatTickDate, fontSize: 10, color: MUTED_COLOR },
        axisLine: { lineStyle: { color: BORDER_COLOR } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: formatCurrency, fontSize: 10, color: MUTED_COLOR },
        splitLine: { lineStyle: { color: BORDER_COLOR } },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#ffffff',
        borderColor: BORDER_COLOR,
        borderWidth: 1,
        textStyle: { color: TEXT_COLOR, fontSize: 12 },
        extraCssText: 'border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);',
        valueFormatter: (value: unknown) => formatCurrency(Number(value)),
      },
      series: [
        {
          name: 'This period',
          type: 'line',
          data: current.map((p) => p.value),
          lineStyle: { width: 2 },
          symbol: 'none',
          endLabel: {
            show: true,
            formatter: () => (current.length > 0 ? formatCurrency(current[current.length - 1].value) : ''),
            color: TEXT_COLOR,
            fontSize: 11,
            fontWeight: 600,
          },
        },
        {
          name: comparisonLabel,
          type: 'line',
          data: comparison.map((p) => p.value),
          lineStyle: { width: 2 },
          symbol: 'none',
        },
      ],
    });
  }, [current, comparison, comparisonLabel]);

  if (current.length === 0) {
    return <p className="text-sm text-muted">No data for this period yet.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs font-medium text-secondary">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
          This period
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: COMPARISON_COLOR }} />
          {comparisonLabel}
        </span>
      </div>

      <div
        ref={containerRef}
        role="img"
        aria-label="Order value trend, current period vs. previous period"
        className="h-64 w-full"
      />

      {/* Table view — the accessible, always-reachable fallback for every value the chart shows.
          Load-bearing for accessibility now that the plot itself is canvas-rendered. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">View as table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-canvas">
              <tr>
                <th className="px-3 py-1.5 font-semibold text-muted">Date</th>
                <th className="px-3 py-1.5 font-semibold text-muted">This period</th>
                <th className="px-3 py-1.5 font-semibold text-muted">{comparisonLabel}</th>
              </tr>
            </thead>
            <tbody>
              {current.map((point, i) => (
                <tr key={point.date} className="border-t border-border">
                  <td className="px-3 py-1.5 text-text">{point.date}</td>
                  <td className="px-3 py-1.5 tabular-nums text-text">{formatCurrency(point.value)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-text">{formatCurrency(comparison[i]?.value ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
