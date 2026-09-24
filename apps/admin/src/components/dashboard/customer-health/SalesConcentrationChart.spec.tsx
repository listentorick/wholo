import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CustomerHealthSalesConcentration } from '@wholo/types';
import { SalesConcentrationChart } from './SalesConcentrationChart';

const setOption = vi.fn();
vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({ setOption: (...a: unknown[]) => setOption(...a), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ BarChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const currency = (v: number) => `£${v}`;
const sales: CustomerHealthSalesConcentration = {
  periodDays: 90,
  totalValue: 1000,
  top5Share: 0.8,
  otherValue: 200,
  otherShare: 0.2,
  topCustomers: [
    { customerId: 'r1', customerName: 'Marlowe Hotel', tier: 'healthy', value: 500, share: 0.5 },
    { customerId: 'r2', customerName: 'Riverside Care Home', tier: 'at_risk', value: 300, share: 0.3 },
  ],
};

describe('SalesConcentrationChart', () => {
  it('states how much of sales the top customers account for, and the rest as other, in real text', () => {
    render(<SalesConcentrationChart sales={sales} currency={currency} />);

    expect(screen.getByText('Where our sales come from')).toBeInTheDocument();
    expect(screen.getByText(/top 2 customers account for/i)).toHaveTextContent('80.0%');
    // "All other customers" is also a row in the table fallback; the first match is the visible row.
    const otherRow = screen.getAllByText('All other customers')[0].closest('div');
    expect(otherRow).toHaveTextContent('£200');
    expect(otherRow).toHaveTextContent('20.0%');
  });

  it('hands the chart one bar per customer', () => {
    render(<SalesConcentrationChart sales={sales} currency={currency} />);

    const option = setOption.mock.calls.at(-1)?.[0] as { series: Array<{ data: number[] }> };
    expect(option.series[0].data).toEqual([500, 300]);
  });

  it('gives the plot an accessible summary, and every value plus each customer\'s health in the table fallback', () => {
    render(<SalesConcentrationChart sales={sales} currency={currency} />);

    expect(screen.getByRole('img', { name: /top 2 customers by sales in the last 90 days/i })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('Riverside Care Home');
    expect(table).toHaveTextContent('At risk');
    expect(table).toHaveTextContent('£300');
    expect(table).toHaveTextContent('All other customers');
  });

  it('draws the chart when sales arrive after an empty first load (the container did not exist at mount)', () => {
    const empty = { ...sales, totalValue: 0, top5Share: null, otherValue: 0, otherShare: null, topCustomers: [] };
    const { rerender } = render(<SalesConcentrationChart sales={empty} currency={currency} />);
    setOption.mockClear();

    rerender(<SalesConcentrationChart sales={sales} currency={currency} />);

    const option = setOption.mock.calls.at(-1)?.[0] as { series: Array<{ data: number[] }> } | undefined;
    expect(option?.series[0].data).toEqual([500, 300]);
  });

  it('says so when there were no sales', () => {
    render(<SalesConcentrationChart sales={{ ...sales, totalValue: 0, top5Share: null, otherValue: 0, otherShare: null, topCustomers: [] }} currency={currency} />);
    expect(screen.getByText('No sales in the last 90 days.')).toBeInTheDocument();
  });
});
