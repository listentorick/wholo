import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryBoardFilters } from './DeliveryBoardFilters';

describe('DeliveryBoardFilters', () => {
  it('marks the current filter as pressed', () => {
    render(<DeliveryBoardFilters filter="all" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Unassigned only' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked filter', async () => {
    const onChange = vi.fn();
    render(<DeliveryBoardFilters filter="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Unassigned only' }));
    expect(onChange).toHaveBeenCalledWith('unassigned');
  });

  it('renders and selects the Missed only option', async () => {
    const onChange = vi.fn();
    render(<DeliveryBoardFilters filter="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Missed only' }));
    expect(onChange).toHaveBeenCalledWith('missed');
  });
});
