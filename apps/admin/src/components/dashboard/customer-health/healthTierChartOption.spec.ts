import { describe, it, expect } from 'vitest';
import { buildHealthTierOption, TIER_COLOURS } from './healthTierChartOption';

type TierSeries = { name: string; type: string; stack: string; data: number[]; itemStyle: { color: string } };
const series = (counts: { healthy: number; watch: number; at_risk: number }) =>
  (buildHealthTierOption(counts) as unknown as { series: TierSeries[] }).series;

describe('buildHealthTierOption', () => {
  it('stacks the three tiers in one bar, each carrying its own count', () => {
    const s = series({ healthy: 178, watch: 52, at_risk: 18 });
    expect(s.map((x) => x.stack)).toEqual(['tier', 'tier', 'tier']);
    expect(s.map((x) => x.data[0])).toEqual([178, 52, 18]);
  });

  it('colours each tier consistently with the rest of the dashboard (green/orange/red)', () => {
    const s = series({ healthy: 1, watch: 1, at_risk: 1 });
    expect(s.find((x) => x.name === 'Healthy')?.itemStyle.color).toBe(TIER_COLOURS.healthy);
    expect(s.find((x) => x.name === 'Watch')?.itemStyle.color).toBe(TIER_COLOURS.watch);
    expect(s.find((x) => x.name === 'At risk')?.itemStyle.color).toBe(TIER_COLOURS.at_risk);
  });

  it('renders all-zero segments for a distributor with no active customers, rather than dividing by zero', () => {
    const s = series({ healthy: 0, watch: 0, at_risk: 0 });
    expect(s.map((x) => x.data[0])).toEqual([0, 0, 0]);
  });
});
