import type { EChartsCoreOption } from 'echarts/core';

// Same tone family as StatusBadge's green/orange/red, so the tier bar reads as
// one system with the badges elsewhere on this page.
export const TIER_COLOURS = { healthy: '#16A34A', watch: '#F2864D', at_risk: '#DC2626' } as const;

/**
 * A single horizontal 100%-stacked bar: proportion only, no axis chrome. The
 * dl grid the caller renders beside it carries the real numbers, labels and
 * descriptions — the chart itself never needs to be read for those, so
 * colour alone here is fine (it duplicates, rather than solely carries, the
 * legend below it).
 */
export function buildHealthTierOption(counts: { healthy: number; watch: number; at_risk: number }): EChartsCoreOption {
  const total = counts.healthy + counts.watch + counts.at_risk;
  const segment = (key: keyof typeof counts, name: string) => ({
    name,
    type: 'bar' as const,
    stack: 'tier',
    data: [total > 0 ? counts[key] : 0],
    itemStyle: { color: TIER_COLOURS[key] },
  });

  return {
    grid: { top: 0, right: 0, bottom: 0, left: 0 },
    xAxis: { type: 'value', show: false, max: total > 0 ? total : 1 },
    yAxis: { type: 'category', show: false, data: [''] },
    series: [segment('healthy', 'Healthy'), segment('watch', 'Watch'), segment('at_risk', 'At risk')],
  };
}
