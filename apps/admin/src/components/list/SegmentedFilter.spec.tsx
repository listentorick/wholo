import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedFilter } from './SegmentedFilter';

const OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'unassigned' as const, label: 'Unassigned only' },
  { value: 'missed' as const, label: 'Missed only' },
];

const pills = () => within(screen.getByTestId('filter-pills'));

describe('SegmentedFilter', () => {
  it('marks the current value as pressed, among the pill options', () => {
    render(<SegmentedFilter ariaLabel="Filter deliveries" value="all" options={OPTIONS} onChange={vi.fn()} />);

    expect(pills().getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(pills().getByRole('button', { name: 'Unassigned only' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked option, from the pills', async () => {
    const onChange = vi.fn();
    render(<SegmentedFilter ariaLabel="Filter deliveries" value="all" options={OPTIONS} onChange={onChange} />);

    await userEvent.click(pills().getByRole('button', { name: 'Missed only' }));

    expect(onChange).toHaveBeenCalledWith('missed');
  });

  it('renders a compact select with the same options for narrow screens, and reports a change from it', async () => {
    const onChange = vi.fn();
    render(<SegmentedFilter ariaLabel="Filter deliveries" value="unassigned" options={OPTIONS} onChange={onChange} />);

    expect(screen.getByTestId('filter-select')).toHaveValue('unassigned');
    await userEvent.selectOptions(screen.getByTestId('filter-select'), 'missed');
    expect(onChange).toHaveBeenCalledWith('missed');
  });

  it('names both variants with the given aria-label', () => {
    render(<SegmentedFilter ariaLabel="Filter the list" value="all" options={OPTIONS} onChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Filter the list' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter the list' })).toBeInTheDocument();
  });

  describe('a count on an option', () => {
    const withCounts = [{ value: 'ALL' as const, label: 'All' }, { value: 'OVERDUE' as const, label: 'Overdue', count: 5 }];

    it('shows the count on the pill', () => {
      render(<SegmentedFilter ariaLabel="Filter" value="ALL" options={withCounts} onChange={vi.fn()} />);
      expect(pills().getByRole('button', { name: 'Overdue 5' })).toBeInTheDocument();
    });

    it('shows the count on the select option, in parentheses (a native <option> cannot carry a styled badge)', () => {
      render(<SegmentedFilter ariaLabel="Filter" value="ALL" options={withCounts} onChange={vi.fn()} />);
      expect(within(screen.getByTestId('filter-select')).getByRole('option', { name: 'Overdue (5)' })).toBeInTheDocument();
    });

    it('leaves an option with no count exactly as its plain label', () => {
      render(<SegmentedFilter ariaLabel="Filter" value="ALL" options={withCounts} onChange={vi.fn()} />);
      expect(pills().getByRole('button', { name: 'All' })).toBeInTheDocument();
    });
  });
});
