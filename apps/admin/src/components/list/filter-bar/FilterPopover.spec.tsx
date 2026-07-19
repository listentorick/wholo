import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterPopover } from './FilterPopover';
import type { FilterFieldConfig } from './types';

const fields: FilterFieldConfig[] = [
  {
    field: 'status',
    label: 'Status',
    operators: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }],
    valueKind: 'multi-select',
    options: [
      { value: 'SUBMITTED', label: 'Pending' },
      { value: 'ACCEPTED', label: 'Accepted' },
    ],
  },
  {
    field: 'customerName',
    label: 'Customer',
    operators: [{ value: 'contains', label: 'contains' }],
    valueKind: 'text',
  },
];

describe('FilterPopover', () => {
  it('defaults to the first field and its first operator', () => {
    render(<FilterPopover fields={fields} onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Field' })).toHaveValue('status');
    expect(screen.getByRole('combobox', { name: 'Operator' })).toHaveValue('is');
  });

  it('resets operator and value when the field changes', async () => {
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} onApply={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByLabelText('Pending'));
    expect(screen.getByRole('button', { name: 'Apply →' })).toBeEnabled();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Field' }), 'customerName');
    expect(screen.getByRole('combobox', { name: 'Operator' })).toHaveValue('contains');
    // Value reset — Apply disabled again since the text input is empty.
    expect(screen.getByRole('button', { name: 'Apply →' })).toBeDisabled();
  });

  it('disables Apply until a valid value is chosen, per field valueKind', async () => {
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} onApply={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Apply →' })).toBeDisabled();
    await user.click(screen.getByLabelText('Pending'));
    expect(screen.getByRole('button', { name: 'Apply →' })).toBeEnabled();
  });

  it('calls onApply with the built filter and onCancel when cancelled', async () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} onApply={onApply} onCancel={onCancel} />);

    await user.click(screen.getByLabelText('Pending'));
    await user.click(screen.getByRole('button', { name: 'Apply →' }));
    expect(onApply).toHaveBeenCalledWith({ field: 'status', operator: 'is', value: ['SUBMITTED'] });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
