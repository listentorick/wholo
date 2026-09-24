import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthTierBar } from './HealthTierBar';

// ECharts needs a real canvas backend, which jsdom doesn't provide — mock it
// at the module boundary, same as OrderTrendChart.spec.tsx.
vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ BarChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

describe('HealthTierBar', () => {
  it('shows a count and description for every tier, never colour alone', () => {
    render(<HealthTierBar counts={{ healthy: 178, watch: 52, at_risk: 18 }} />);

    expect(screen.getByText('Healthy').closest('div')).toHaveTextContent('178');
    expect(screen.getByText('Watch').closest('div')).toHaveTextContent('52');
    expect(screen.getByText('At risk').closest('div')).toHaveTextContent('18');
    expect(screen.getByText('Some signs of decline')).toBeInTheDocument();
  });

  it('does not claim a payment signal — the tiers are built from ordering and delivery only', () => {
    render(<HealthTierBar counts={{ healthy: 1, watch: 1, at_risk: 1 }} />);
    expect(screen.queryByText(/payment/i)).not.toBeInTheDocument();
    expect(screen.getByText('Low activity or delivery problems')).toBeInTheDocument();
  });

  it('gives the proportion bar an accessible summary, since the plot itself is canvas', () => {
    render(<HealthTierBar counts={{ healthy: 178, watch: 52, at_risk: 18 }} />);
    expect(screen.getByRole('img', { name: '178 of 248 customers healthy, 52 watch, 18 at risk' })).toBeInTheDocument();
  });
});
