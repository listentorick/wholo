import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrdersPerDayChart } from './OrdersPerDayChart';

const setOption = vi.fn();
vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({ setOption, resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ BarChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const stats = { ordersPerDay: [{ date: '2026-10-22', orders: 4 }, { date: '2026-10-23', orders: 1 }] };

describe('OrdersPerDayChart', () => {
  it('draws one bar per day', () => {
    render(<OrdersPerDayChart stats={stats} />);
    const option = setOption.mock.calls.at(-1)![0];
    expect(option.xAxis.data).toEqual(['2026-10-22', '2026-10-23']);
    expect(option.series).toEqual([expect.objectContaining({ type: 'bar', name: 'Orders placed', data: [4, 1] })]);
  });

  it('summarises the chart for screen readers and offers every value as a table', () => {
    render(<OrdersPerDayChart stats={stats} />);
    expect(screen.getByRole('img', { name: /last 2 days: 5 in total/i })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('2026-10-22');
  });
});
