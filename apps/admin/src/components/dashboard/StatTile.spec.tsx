import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatTile, StatTileFrame } from './StatTile';
import type { AnalyticsComparison } from '@wholo/types';

const base: AnalyticsComparison = { current: 0, comparison: 0, status: 'value', absoluteChange: 0, percentageChange: null };

describe('StatTile', () => {
  it('renders a compact value', () => {
    render(<StatTile label="Orders placed" comparison={{ ...base, current: 1284 }} />);
    expect(screen.getByText('1.3K')).toBeInTheDocument();
  });

  it('shows "Building history" instead of a percentage when there is insufficient history', () => {
    render(<StatTile label="Order value" comparison={{ ...base, current: 500, status: 'insufficient_history', comparison: null }} />);
    expect(screen.getByText('Building history')).toBeInTheDocument();
  });

  it('shows "New" instead of a misleading percentage when the comparison value is genuinely zero', () => {
    render(<StatTile label="Order value" comparison={{ ...base, current: 500, status: 'new', absoluteChange: 500 }} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows a green upward change for growth', () => {
    render(<StatTile label="Order value" comparison={{ ...base, current: 1300, percentageChange: 30, absoluteChange: 300 }} />);
    const delta = screen.getByText(/30\.0%/);
    expect(delta.className).toContain('text-green-600');
  });

  it('shows a red downward change for a decline', () => {
    render(<StatTile label="Order value" comparison={{ ...base, current: 750, percentageChange: -25, absoluteChange: -250 }} />);
    const delta = screen.getByText(/25\.0%/);
    expect(delta.className).toContain('text-red-600');
  });

  it('applies a custom formatter (e.g. currency)', () => {
    render(<StatTile label="Order value" comparison={{ ...base, current: 1300 }} format={(v) => `£${v}`} />);
    expect(screen.getByText('£1300')).toBeInTheDocument();
  });
});

describe('StatTileFrame', () => {
  it('is a plain card by default: label, value and footer, no button', () => {
    render(<StatTileFrame label="To accept" value={4} footer={<span>Waiting</span>} />);
    expect(screen.getByText('To accept')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('becomes a toggle button when given a click handler, reporting whether it is selected', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<StatTileFrame label="Overdue" value={2} onClick={onClick} selected={false} />);

    const tile = screen.getByRole('button', { name: /overdue/i });
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<StatTileFrame label="Overdue" value={2} onClick={onClick} selected />);
    expect(screen.getByRole('button', { name: /overdue/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
