import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailTabs } from './DetailTabs';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'account', label: 'Account' },
];

describe('DetailTabs', () => {
  it('renders all tab labels', () => {
    render(<DetailTabs tabs={TABS} activeKey="overview" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('styles the active tab differently from inactive tabs', () => {
    render(<DetailTabs tabs={TABS} activeKey="account" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Account' }).className).toContain('border-primary');
    expect(screen.getByRole('button', { name: 'Overview' }).className).toContain('border-transparent');
  });

  it('shows a count after the label when one is given, and nothing otherwise', () => {
    render(<DetailTabs tabs={[{ key: 'a', label: 'Active', count: 4 }, { key: 'b', label: 'Other' }]} activeKey="a" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Active 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other' })).toBeInTheDocument();
  });

  it('shows a zero count (an empty filter is still worth knowing about)', () => {
    render(<DetailTabs tabs={[{ key: 'a', label: 'Pending', count: 0 }]} activeKey="a" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pending 0' })).toBeInTheDocument();
  });

  it('calls onChange with the clicked tab key', async () => {
    const onChange = vi.fn();
    render(<DetailTabs tabs={TABS} activeKey="overview" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(onChange).toHaveBeenCalledWith('account');
  });
});
