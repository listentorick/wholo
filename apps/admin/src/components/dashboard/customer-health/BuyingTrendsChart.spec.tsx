import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuyingTrendsChart } from './BuyingTrendsChart';

const setOption = vi.fn();
vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({ setOption: (...a: unknown[]) => setOption(...a), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const weeks = [
  { weekStart: '2026-08-03', expectedOrders: 120, placedOrders: 98 },
  { weekStart: '2026-08-10', expectedOrders: 120, placedOrders: 165 },
];

describe('BuyingTrendsChart', () => {
  it('shows a no-data message when there are no weeks', () => {
    render(<BuyingTrendsChart weeks={[]} />);
    expect(screen.getByText('No data for this period yet.')).toBeInTheDocument();
  });

  it('renders a legend naming both series, since colour never carries the meaning alone', () => {
    render(<BuyingTrendsChart weeks={weeks} />);
    // "Placed orders"/"Expected orders" legitimately appear twice — legend and table header.
    expect(screen.getAllByText('Placed orders')).toHaveLength(2);
    expect(screen.getAllByText('Expected orders')).toHaveLength(2);
    expect(screen.getByRole('img', { name: /weekly expected vs\. placed orders/i })).toBeInTheDocument();
  });

  it('exposes every value through the accessible table fallback', () => {
    render(<BuyingTrendsChart weeks={weeks} />);
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('3 Aug');
    expect(table).toHaveTextContent('98');
    expect(table).toHaveTextContent('120');
  });

  it('drops the expected series and says why when there is no baseline yet', () => {
    render(<BuyingTrendsChart weeks={weeks.map((w) => ({ ...w, expectedOrders: null }))} />);

    expect(screen.getAllByText('Placed orders')).toHaveLength(2);
    expect(screen.getAllByText('Expected orders')).toHaveLength(1); // the table header only — no legend entry
    expect(screen.getByText(/expected orders appear once there are 16 weeks/i)).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('—');
  });

  it('draws the chart when weeks arrive after an empty first load (the container did not exist at mount)', () => {
    const { rerender } = render(<BuyingTrendsChart weeks={[]} />);
    setOption.mockClear();

    rerender(<BuyingTrendsChart weeks={weeks} />);

    const option = setOption.mock.calls.at(-1)?.[0] as { series: Array<{ data: number[] }> } | undefined;
    expect(option?.series[0].data).toEqual([98, 165]);
  });

  it('says the weeks are complete ones, so a part-finished week never reads as a drop', () => {
    render(<BuyingTrendsChart weeks={weeks} />);
    expect(screen.getByText(/last 2 complete weeks/i)).toBeInTheDocument();
  });
});
