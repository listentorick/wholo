import type { EChartsCoreOption } from 'echarts/core';
import { BORDER_COLOR } from '../chart-theme';
import { OUTCOME_COLOURS } from './outcomeChartOption';

// Today's delivery progress, as a half-circle progress ring. All of the gauge's
// own labels/pointer/title/detail are switched off: the percentage and caption
// are real DOM text overlaid by TodayProgress, not chart-drawn, so they stay
// screen-reader- and test-queryable the normal way — the chart draws only the
// track and the progress arc. Same green as "on time" elsewhere on the
// dashboard (OUTCOME_COLOURS.onTime) and the same track grey as every other
// chart's gridlines (BORDER_COLOR), so this reads as one system with them.
export function buildGaugeOption(percent: number): EChartsCoreOption {
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        center: ['50%', '90%'],
        radius: '135%',
        splitNumber: 1,
        axisLine: { lineStyle: { width: 18, color: [[1, BORDER_COLOR]] } },
        // A rounded cap on a zero-length arc still paints a visible dot at 0% — same
        // reasoning as the previous hand-drawn version, which simply didn't draw the
        // green path at all until there was something to show.
        progress: { show: percent > 0, width: 18, roundCap: true, itemStyle: { color: OUTCOME_COLOURS.onTime } },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value: percent }],
      },
    ],
  };
}
