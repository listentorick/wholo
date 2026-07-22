import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatTile } from './StatTile';
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
