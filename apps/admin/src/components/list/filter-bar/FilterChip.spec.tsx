import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChip } from './FilterChip';
import type { ActiveFilter, FilterFieldConfig } from './types';

const statusConfig: FilterFieldConfig = {
  field: 'status',
  label: 'Status',
  operators: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }],
  valueKind: 'multi-select',
  options: [
    { value: 'SUBMITTED', label: 'Pending' },
    { value: 'ACCEPTED', label: 'Accepted' },
  ],
};

const dateConfig: FilterFieldConfig = {
  field: 'requestedDeliveryDate',
  label: 'Delivery date',
  operators: [
    { value: 'after', label: 'after' },
    { value: 'between', label: 'between' },
  ],
  valueKind: 'date',
  formatValue: (raw) => `fmt(${raw})`,
};

const textConfig: FilterFieldConfig = {
  field: 'customerName',
  label: 'Customer',
  operators: [{ value: 'contains', label: 'contains' }],
  valueKind: 'text',
};

describe('FilterChip', () => {
  it('formats a multi-select value by looking up option labels', () => {
    const filter: ActiveFilter = { id: '1', field: 'status', operator: 'is', value: ['SUBMITTED', 'ACCEPTED'] };
    render(<FilterChip filter={filter} config={statusConfig} onEdit={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Pending, Accepted')).toBeInTheDocument();
  });

  it('formats a date-range value with formatValue applied to both ends', () => {
    const filter: ActiveFilter = { id: '1', field: 'requestedDeliveryDate', operator: 'between', value: '2026-01-01,2026-01-31' };
    render(<FilterChip filter={filter} config={dateConfig} onEdit={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('fmt(2026-01-01) – fmt(2026-01-31)')).toBeInTheDocument();
  });

  it('formats a plain text value raw when no formatValue is given', () => {
    const filter: ActiveFilter = { id: '1', field: 'customerName', operator: 'contains', value: 'Blackbird' };
    render(<FilterChip filter={filter} config={textConfig} onEdit={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Blackbird')).toBeInTheDocument();
  });

  it('calls onEdit when the chip body is clicked and onRemove when the × is clicked', async () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    const filter: ActiveFilter = { id: '1', field: 'customerName', operator: 'contains', value: 'Blackbird' };
    render(<FilterChip filter={filter} config={textConfig} onEdit={onEdit} onRemove={onRemove} />);

    await user.click(screen.getByText('Blackbird'));
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Remove filter' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
