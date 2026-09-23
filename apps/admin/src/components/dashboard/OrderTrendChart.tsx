'use client';

import { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { OrderTrendPoint } from '@wholo/types';
import { getCurrencySymbol } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { ChartLegend } from './ChartLegend';
import { ChartTableFallback } from './ChartTableFallback';
import { TEXT_COLOR, axisLabelStyle, axisLineStyle, chartTooltip, splitLineStyle } from './chart-theme';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  current: OrderTrendPoint[];
  comparison: OrderTrendPoint[];
  comparisonLabel: string;
  currencyCode: string;
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

const tickDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
// The `T00:00:00` suffix keeps parsing anchored to the local calendar day —
// OrderTrendPoint.date is always a zero-filled daily bucket (see
// apps/api/src/analytics/analytics.service.ts), and without it
// `new Date('2026-03-15')` parses as UTC midnight, which renders as the
// previous day in any timezone behind UTC.
function formatTickDate(isoDate: string): string {
  return tickDateFormatter.format(new Date(`${isoDate}T00:00:00`));
}

const END_LABEL_FONT = '600 11px sans-serif';
let measureCanvas: HTMLCanvasElement | null = null;

// grid.right has no `containLabel`-style auto-fit for series endLabels (that
// option only measures axis labels), so the end-of-line currency label needs
// its gutter sized by hand — measured from the actual text instead of a
// fixed guess, so mobile cards don't carry more right-hand padding than the
// label needs.
function measureEndLabelWidth(text: string): number {
  if (!text) return 0;
  try {
    measureCanvas ??= document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = END_LABEL_FONT;
    return ctx.measureText(text).width;
  } catch {
    // jsdom (unit tests) has no canvas backend — fall back to no gutter.
    return 0;
  }
}

export function OrderTrendChart({ current, comparison, comparisonLabel, currencyCode }: Props) {
  function formatCurrency(value: number): string {
    return `${getCurrencySymbol(currencyCode)}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  const { containerRef, chartRef } = useEChart();

  useEffect(() => {
    if (!chartRef.current) return;

    const lastCurrentLabel = current.length > 0 ? formatCurrency(current[current.length - 1].value) : '';
    const endLabelGutter = current.length > 0 ? measureEndLabelWidth(lastCurrentLabel) + 8 : 0;

    chartRef.current.setOption({
      color: [CURRENT_COLOR, COMPARISON_COLOR],
      grid: { top: 16, right: endLabelGutter, bottom: 28, left: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: current.map((p) => p.date),
        axisLabel: { formatter: formatTickDate, ...axisLabelStyle },
        axisLine: axisLineStyle,
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: formatCurrency, ...axisLabelStyle },
        splitLine: splitLineStyle,
      },
      tooltip: {
        trigger: 'axis',
        ...chartTooltip,
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
  }, [current, comparison, comparisonLabel, currencyCode, chartRef]);

  if (current.length === 0) {
    return <p className="text-sm text-muted">No data for this period yet.</p>;
  }

  return (
    <div>
      <ChartLegend items={[{ label: 'This period', color: CURRENT_COLOR }, { label: comparisonLabel, color: COMPARISON_COLOR }]} />

      <div
        ref={containerRef}
        role="img"
        aria-label="Order value trend, current period vs. previous period"
        className="h-64 w-full"
      />

      <ChartTableFallback
        columns={['Date', 'This period', comparisonLabel]}
        rows={current.map((point, i) => [point.date, formatCurrency(point.value), formatCurrency(comparison[i]?.value ?? 0)])}
      />
    </div>
  );
}
