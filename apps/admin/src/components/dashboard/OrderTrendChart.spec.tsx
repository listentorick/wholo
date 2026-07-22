import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderTrendChart } from './OrderTrendChart';

describe('OrderTrendChart', () => {
  it('shows a no-data message when there are no points', () => {
    render(<OrderTrendChart current={[]} comparison={[]} comparisonLabel="vs. previous period" />);
    expect(screen.getByText('No data for this period yet.')).toBeInTheDocument();
  });

  it('renders the chart with a legend for both series', () => {
    render(
      <OrderTrendChart
        current={[{ date: '2026-03-15', value: 1300, count: 10 }]}
        comparison={[{ date: '2026-02-15', value: 1000, count: 8 }]}
        comparisonLabel="vs. previous period"
      />,
    );

    // "This period" legitimately appears twice — once in the legend, once as
    // the accessible table view's column header — so assert on both rather
    // than a single ambiguous match.
    expect(screen.getAllByText('This period')).toHaveLength(2);
    expect(screen.getAllByText('vs. previous period')).toHaveLength(2);
    expect(screen.getByRole('img', { name: /order value trend/i })).toBeInTheDocument();
  });

  it('exposes every value through the accessible table view', () => {
    render(
      <OrderTrendChart
        current={[{ date: '2026-03-15', value: 1300, count: 10 }]}
        comparison={[{ date: '2026-02-15', value: 1000, count: 8 }]}
        comparisonLabel="vs. previous period"
      />,
    );

    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('2026-03-15');
    expect(table).toHaveTextContent('£1,300');
    expect(table).toHaveTextContent('£1,000');
  });
});
