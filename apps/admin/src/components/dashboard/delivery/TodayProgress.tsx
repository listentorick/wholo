import { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { GaugeChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { DeliveryOverview } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { buildGaugeOption } from './gaugeOption';

echarts.use([GaugeChart, CanvasRenderer]);

// The ring itself, drawn by ECharts (a half-circle progress gauge); the
// percentage and caption are DOM text overlaid on top by the caller, not
// chart-drawn — see gaugeOption.ts.
function Gauge({ percent }: { percent: number }) {
  const { containerRef, chartRef } = useEChart();

  useEffect(() => {
    chartRef.current?.setOption(buildGaugeOption(percent), true);
  }, [percent, chartRef]);

  return <div ref={containerRef} role="img" aria-label={`${percent}% of today's deliveries delivered`} className="mx-auto h-32 w-56" />;
}

export function TodayProgress({ progress }: { progress: DeliveryOverview['progress'] }) {
  const { planned, delivered, failed, remaining } = progress;
  const percent = planned === 0 ? 0 : Math.round((delivered / planned) * 100);

  return (
    <section className="rounded-lg border border-border bg-white p-5" aria-labelledby="today-progress-heading">
      <h2 id="today-progress-heading" className="text-sm font-semibold text-text">Today&rsquo;s delivery progress</h2>
      <p className="mt-0.5 text-xs text-muted">Delivered against what was planned for today.</p>

      {planned === 0 ? (
        <p className="py-12 text-center text-sm text-muted">Nothing is planned for delivery today.</p>
      ) : (
        <>
          <div className="relative mt-2">
            <Gauge percent={percent} />
            <div className="absolute inset-x-0 bottom-1 text-center">
              <p className="text-3xl font-semibold leading-none text-text">{percent}%</p>
              <p className="mt-1 text-xs text-muted">{delivered === 0 ? 'Nothing delivered yet' : 'of deliveries delivered'}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-4 divide-x divide-border border-t border-border pt-4 text-center">
            {[
              { label: 'Delivered', value: delivered, dot: 'bg-green-600' },
              { label: 'Failed', value: failed, dot: 'bg-red-700' },
              { label: 'Remaining', value: remaining, dot: 'bg-gray-400' },
              { label: 'Planned', value: planned, dot: null },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="text-xl font-semibold text-text">{stat.value}</dd>
                <dt className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted">
                  {stat.dot && <span className={`h-2 w-2 rounded-full ${stat.dot}`} aria-hidden="true" />}
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
