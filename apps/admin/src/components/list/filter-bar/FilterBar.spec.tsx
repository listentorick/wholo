import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from './FilterBar';
import type { ActiveFilter, FilterFieldConfig } from './types';

const fields: FilterFieldConfig[] = [
  {
    field: 'customerName',
    label: 'Customer',
    operators: [{ value: 'contains', label: 'contains' }],
    valueKind: 'text',
  },
];

const filters: ActiveFilter[] = [
  { id: '1', field: 'customerName', operator: 'contains', value: 'Blackbird' },
  { id: '2', field: 'customerName', operator: 'contains', value: 'Vine' },
];

describe('FilterBar', () => {
  it('renders one chip per active filter', () => {
    render(<FilterBar fields={fields} filters={filters} onFiltersChange={vi.fn()} onClearAll={vi.fn()} />);
    expect(screen.getByText('Blackbird')).toBeInTheDocument();
    expect(screen.getByText('Vine')).toBeInTheDocument();
  });

  it('opens the popover when Add filter is clicked', async () => {
    const user = userEvent.setup();
    render(<FilterBar fields={fields} filters={[]} onFiltersChange={vi.fn()} onClearAll={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Apply →' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(screen.getByRole('button', { name: 'Apply →' })).toBeInTheDocument();
  });

  it('closes the popover on outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <FilterBar fields={fields} filters={[]} onFiltersChange={vi.fn()} onClearAll={vi.fn()} />
        <div data-testid="outside">Outside</div>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(screen.getByRole('button', { name: 'Apply →' })).toBeInTheDocument();

    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('button', { name: 'Apply →' })).not.toBeInTheDocument();
  });

  it('shows Clear all only when there are filters or an extra chip, and calls onClearAll', async () => {
    const onClearAll = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <FilterBar fields={fields} filters={[]} onFiltersChange={vi.fn()} onClearAll={onClearAll} />,
    );
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();

    rerender(<FilterBar fields={fields} filters={filters} onFiltersChange={vi.fn()} onClearAll={onClearAll} />);
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('renders extraChip content and treats it like Clear-all-worthy state', () => {
    render(
      <FilterBar
        fields={fields}
        filters={[]}
        onFiltersChange={vi.fn()}
        onClearAll={vi.fn()}
        extraChip={<span>Sort: Delivery date</span>}
      />,
    );
    expect(screen.getByText('Sort: Delivery date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
  });
});
