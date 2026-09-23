'use client';

import { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { DeliveryOutcomeDay } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { ChartLegend } from '../ChartLegend';
import { ChartTableFallback } from '../ChartTableFallback';
import { OUTCOME_COLOURS, buildOutcomeOption, outcomeSummary } from './outcomeChartOption';
import { OutcomeBar, dayLabel, onTimeRate } from './delivery';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  bars: OutcomeBar[];
  /** Completed days only — the on-time headline is about days that have finished. */
  history: DeliveryOutcomeDay[];
}

export function OutcomeChart({ bars, history }: Props) {
  const { containerRef, chartRef } = useEChart();

  useEffect(() => {
    chartRef.current?.setOption(buildOutcomeOption(bars), true);
  }, [bars, chartRef]);

  const rate = onTimeRate(history);
  const hasHistory = history.some((d) => d.onTime + d.late + d.failed > 0);

  return (
    <div>
      {rate !== null && (
        <p className="mb-3 text-sm text-muted"><span className="text-xl font-semibold text-text">{rate}%</span>{' '}delivered on the day committed, over the last 7 completed days (today is still in progress)</p>
      )}
      {!hasHistory && (
        <p className="mb-3 text-sm text-muted">Nothing on record for the previous days yet. History builds up from here.</p>
      )}

      <ChartLegend
        items={[
          { label: 'On time', color: OUTCOME_COLOURS.onTime, variant: 'box' },
          { label: 'Late', color: OUTCOME_COLOURS.late, variant: 'box' },
          { label: 'Failed', color: OUTCOME_COLOURS.failed, variant: 'box' },
          { label: 'Still to do (today)', color: OUTCOME_COLOURS.todo, variant: 'hatch' },
          { label: 'Planned', color: OUTCOME_COLOURS.planned, variant: 'dashed' },
        ]}
      />

      <div ref={containerRef} role="img" aria-label={`Deliveries by outcome, last seven days and today. ${outcomeSummary(bars)}`} className="h-64 w-full" />

      <ChartTableFallback
        columns={['Day', 'On time', 'Late', 'Failed', 'Still to do', 'Planned']}
        rows={bars.map((b) => [b.isToday ? `${dayLabel(b.date)} (today)` : dayLabel(b.date), b.onTime, b.late, b.failed, b.todo, b.total])}
      />
    </div>
  );
}
