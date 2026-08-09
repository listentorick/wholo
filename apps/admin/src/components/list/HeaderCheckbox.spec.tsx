import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderCheckbox } from './HeaderCheckbox';

describe('HeaderCheckbox', () => {
  it('reflects checked state', () => {
    render(<HeaderCheckbox checked indeterminate={false} onChange={() => {}} ariaLabel="Select all loaded products" />);
    expect(screen.getByLabelText('Select all loaded products')).toBeChecked();
  });

  it('reflects unchecked state', () => {
    render(<HeaderCheckbox checked={false} indeterminate={false} onChange={() => {}} ariaLabel="Select all loaded products" />);
    expect(screen.getByLabelText('Select all loaded products')).not.toBeChecked();
  });

  it('sets the native indeterminate property when some but not all rows are selected', () => {
    render(<HeaderCheckbox checked={false} indeterminate onChange={() => {}} ariaLabel="Select all loaded products" />);
    const input = screen.getByLabelText('Select all loaded products') as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
  });

  it('calls onChange with the new checked value when toggled', async () => {
    const onChange = vi.fn();
    render(<HeaderCheckbox checked={false} indeterminate={false} onChange={onChange} ariaLabel="Select all loaded products" />);

    await userEvent.click(screen.getByLabelText('Select all loaded products'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
