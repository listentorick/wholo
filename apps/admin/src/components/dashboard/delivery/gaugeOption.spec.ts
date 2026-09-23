import { describe, it, expect } from 'vitest';
import { buildGaugeOption } from './gaugeOption';
import { BORDER_COLOR } from '../chart-theme';
import { OUTCOME_COLOURS } from './outcomeChartOption';

type GaugeSeries = {
  type: string; startAngle: number; endAngle: number; min: number; max: number;
  axisLine: { lineStyle: { color: Array<[number, string]> } };
  progress: { show: boolean; itemStyle: { color: string } };
  pointer: { show: boolean };
  title: { show: boolean };
  detail: { show: boolean };
  data: Array<{ value: number }>;
};
const series = (percent: number) => (buildGaugeOption(percent) as unknown as { series: GaugeSeries[] }).series[0];

describe('buildGaugeOption', () => {
  it('carries the percentage as the one data value', () => {
    expect(series(63).data).toEqual([{ value: 63 }]);
    expect(series(0).data).toEqual([{ value: 0 }]);
    expect(series(100).data).toEqual([{ value: 100 }]);
  });

  it('is a half-circle gauge (over the top, flat along the bottom), 0 to 100', () => {
    const s = series(50);
    expect(s.type).toBe('gauge');
    expect(s.startAngle).toBe(180);
    expect(s.endAngle).toBe(0);
    expect(s.min).toBe(0);
    expect(s.max).toBe(100);
  });

  it("colours the progress green — the same green 'on time' uses in the outcome chart — and the track the same grey every chart's gridlines use", () => {
    const s = series(50);
    expect(s.progress.itemStyle.color).toBe(OUTCOME_COLOURS.onTime);
    expect(s.axisLine.lineStyle.color).toEqual([[1, BORDER_COLOR]]);
  });

  it('draws no built-in labels, pointer or detail text — the percentage is DOM text overlaid by the caller, not chart-drawn', () => {
    const s = series(63);
    expect(s.pointer.show).toBe(false);
    expect(s.title.show).toBe(false);
    expect(s.detail.show).toBe(false);
  });

  it('draws no progress arc at all at 0% — a rounded cap on a zero-length arc still paints a visible dot otherwise', () => {
    expect(series(0).progress.show).toBe(false);
    expect(series(1).progress.show).toBe(true);
    expect(series(100).progress.show).toBe(true);
  });
});
