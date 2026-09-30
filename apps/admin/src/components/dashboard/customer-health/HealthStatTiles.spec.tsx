import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HealthStatTiles } from './HealthStatTiles';

const currency = (v: number) => `£${v}`;
const tiles = { activeCustomers90d: 248, atRiskCount: 18, salesLast30d: 482000, overdueBalances: [{ currency: 'GBP', amount: 1250 }], overdueInvoiceCount: 3 };

describe('HealthStatTiles', () => {
  it('lays out two tiles per row on a phone, like the Sales and Delivery dashboards', () => {
    render(<HealthStatTiles tiles={tiles} riskOnly={false} onToggleRisk={vi.fn()} currency={currency} currencyCode="GBP" />);
    expect(screen.getByRole('group', { name: /customer health summary/i })).toHaveClass('grid-cols-2');
  });

  it('shows active customers, at-risk, sales and the overdue invoice balance', () => {
    render(<HealthStatTiles tiles={tiles} riskOnly={false} onToggleRisk={vi.fn()} currency={currency} currencyCode="GBP" />);

    expect(screen.getByText('Active customers').closest('div')).toHaveTextContent('248');
    expect(screen.getByRole('button', { name: /customers at risk/i })).toHaveTextContent('18');
    expect(screen.getByText('Sales, last 30 days').closest('div')).toHaveTextContent('£482000');
    expect(screen.getByText('Overdue invoices').closest('div')).toHaveTextContent('£1,250');
    expect(screen.getByText('3 invoices past due')).toBeInTheDocument();
  });

  it('never adds overdue money in different currencies together', () => {
    render(
      <HealthStatTiles
        tiles={{ ...tiles, overdueBalances: [{ currency: 'EUR', amount: 80 }, { currency: 'GBP', amount: 1250 }] }}
        riskOnly={false}
        onToggleRisk={vi.fn()}
        currency={currency}
        currencyCode="GBP"
      />,
    );
    expect(screen.getByText('Overdue invoices').closest('div')).toHaveTextContent('€80 + £1,250');
  });

  it("shows no overdue money as zero in the distributor's currency", () => {
    render(
      <HealthStatTiles tiles={{ ...tiles, overdueBalances: [], overdueInvoiceCount: 0 }} riskOnly={false} onToggleRisk={vi.fn()} currency={currency} currencyCode="EUR" />,
    );
    expect(screen.getByText('Overdue invoices').closest('div')).toHaveTextContent('€0');
  });

  it('says plainly when nothing is overdue', () => {
    render(
      <HealthStatTiles tiles={{ ...tiles, overdueBalances: [], overdueInvoiceCount: 0 }} riskOnly={false} onToggleRisk={vi.fn()} currency={currency} currencyCode="GBP" />,
    );
    expect(screen.getByText('Nothing overdue')).toBeInTheDocument();
  });

  it('toggles the risk filter when the at-risk tile is clicked', async () => {
    const onToggleRisk = vi.fn();
    render(<HealthStatTiles tiles={tiles} riskOnly={false} onToggleRisk={onToggleRisk} currency={currency} currencyCode="GBP" />);

    await userEvent.click(screen.getByRole('button', { name: /customers at risk/i }));

    expect(onToggleRisk).toHaveBeenCalled();
  });

  it('shows the filter is on', () => {
    render(<HealthStatTiles tiles={tiles} riskOnly={true} onToggleRisk={vi.fn()} currency={currency} currencyCode="GBP" />);

    const tile = screen.getByRole('button', { name: /customers at risk/i });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    expect(tile).toHaveTextContent('Filter on');
  });
});
