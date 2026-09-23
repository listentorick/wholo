'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';

// The one place an ECharts instance is created and torn down: init once, resize
// when the container does, dispose on unmount. Kept apart from a chart's own
// data-driven effect so resizing never re-creates the instance. Call it before
// that effect (effects run in order) and read `chartRef.current` inside it.
export function useEChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

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

  return { containerRef, chartRef };
}
