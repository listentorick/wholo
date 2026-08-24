import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryBoardFilters } from './DeliveryBoardFilters';

describe('DeliveryBoardFilters', () => {
  it('marks the current filter as pressed', () => {
    render(<DeliveryBoardFilters filter="all" onChange={vi.fn()} />);
    const pills = within(screen.getByTestId('filter-pills'));
    expect(pills.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(pills.getByRole('button', { name: 'Unassigned only' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked filter', async () => {
    const onChange = vi.fn();
    render(<DeliveryBoardFilters filter="all" onChange={onChange} />);
    const pills = within(screen.getByTestId('filter-pills'));
    await userEvent.click(pills.getByRole('button', { name: 'Unassigned only' }));
    expect(onChange).toHaveBeenCalledWith('unassigned');
  });

  it('renders and selects the Missed only option', async () => {
    const onChange = vi.fn();
    render(<DeliveryBoardFilters filter="all" onChange={onChange} />);
    const pills = within(screen.getByTestId('filter-pills'));
    await userEvent.click(pills.getByRole('button', { name: 'Missed only' }));
    expect(onChange).toHaveBeenCalledWith('missed');
  });

  it('renders a compact select with the same options for narrow screens', () => {
    render(<DeliveryBoardFilters filter="unassigned" onChange={vi.fn()} />);
    expect(screen.getByTestId('filter-select')).toHaveValue('unassigned');
  });

  it('calls onChange when the select value changes', async () => {
    const onChange = vi.fn();
    render(<DeliveryBoardFilters filter="all" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByTestId('filter-select'), 'missed');
    expect(onChange).toHaveBeenCalledWith('missed');
  });
});
