import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TodayProgress } from './TodayProgress';

// ECharts needs a real canvas backend, which jsdom doesn't provide — mock it at
// the module boundary, as OrderTrendChart.spec/OutcomeChart.spec do. The gauge's
// content is tested as data in gaugeOption.spec.ts; this covers what this
// component itself does (the empty state, the DOM percentage/stats, wiring).
vi.mock('echarts/core', () => ({ init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })), use: vi.fn() }));
vi.mock('echarts/charts', () => ({ GaugeChart: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

describe('TodayProgress', () => {
  it('shows the share delivered and the delivered / failed / remaining / planned figures', () => {
    render(<TodayProgress progress={{ planned: 51, delivered: 32, failed: 2, remaining: 17 }} />);

    expect(screen.getByRole('img')).toHaveAccessibleName('63% of today\'s deliveries delivered');
    expect(screen.getByText('63%')).toBeInTheDocument();
    expect(screen.getByText('Delivered').previousElementSibling).toHaveTextContent('32');
    expect(screen.getByText('Failed').previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Remaining').previousElementSibling).toHaveTextContent('17');
    expect(screen.getByText('Planned').previousElementSibling).toHaveTextContent('51');
  });

  it('says so when nothing has been delivered yet, rather than showing a bare 0%', () => {
    render(<TodayProgress progress={{ planned: 51, delivered: 0, failed: 0, remaining: 51 }} />);
    expect(screen.getByText('Nothing delivered yet')).toBeInTheDocument();
  });

  it('shows a plain message, not an empty gauge, on a day with nothing planned', () => {
    render(<TodayProgress progress={{ planned: 0, delivered: 0, failed: 0, remaining: 0 }} />);

    expect(screen.getByText(/nothing is planned for delivery today/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('reports 100% when everything planned has been delivered', () => {
    render(<TodayProgress progress={{ planned: 10, delivered: 10, failed: 0, remaining: 0 }} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
