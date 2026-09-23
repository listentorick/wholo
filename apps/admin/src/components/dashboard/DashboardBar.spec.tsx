import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardBar, type DashboardNav } from './DashboardBar';

const nav = (over: Partial<DashboardNav> = {}): DashboardNav => ({
  tabs: [{ key: 'delivery', label: 'Delivery' }, { key: 'sales', label: 'Sales' }],
  activeKey: 'delivery',
  onChange: vi.fn(),
  ...over,
});

describe('DashboardBar', () => {
  it('puts the dashboard tabs and its own controls on one bar', () => {
    const { container } = render(<DashboardBar nav={nav()} actions={<button type="button">Refresh</button>} />);

    const bar = container.firstElementChild!;
    expect(bar.contains(screen.getByRole('button', { name: 'Delivery' }))).toBe(true);
    expect(bar.contains(screen.getByRole('button', { name: 'Sales' }))).toBe(true);
    expect(bar.contains(screen.getByRole('button', { name: 'Refresh' }))).toBe(true);
  });

  it('switches dashboard from the tabs', async () => {
    const onChange = vi.fn();
    render(<DashboardBar nav={nav({ onChange })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sales' }));

    expect(onChange).toHaveBeenCalledWith('sales');
  });

  it('shows the tabs alone while a dashboard has no controls yet (loading or failed)', () => {
    render(<DashboardBar nav={nav()} />);
    expect(screen.getByRole('button', { name: 'Delivery' })).toBeInTheDocument();
  });

  it('with a single dashboard there are no tabs: just the controls', () => {
    render(<DashboardBar actions={<button type="button">Refresh</button>} />);

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('is nothing at all with neither tabs nor controls, rather than an empty gap', () => {
    const { container } = render(<DashboardBar />);
    expect(container).toBeEmptyDOMElement();
  });
});
