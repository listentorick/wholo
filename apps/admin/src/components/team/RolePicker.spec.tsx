import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@wholo/types';
import { RolePicker } from './RolePicker';

describe('RolePicker', () => {
  it('offers only the roles an Owner can grant, each with what it can do', () => {
    render(<RolePicker idPrefix="t" value={[]} onChange={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /Operations manager/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Warehouse staff/ })).toBeInTheDocument();
    expect(screen.getByText(/can’t change company settings/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Driver/ })).not.toBeInTheDocument();
  });

  it('shows the Owner as a locked row that cannot be chosen', () => {
    render(<RolePicker idPrefix="t" value={[]} onChange={vi.fn()} />);

    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText(/Can’t be granted by invitation/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2); // the Owner row has no checkbox
  });

  it('lets several roles be chosen, and unchosen', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RolePicker idPrefix="t" value={[]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /Operations manager/ }));
    expect(onChange).toHaveBeenLastCalledWith([Role.OPERATIONS_MANAGER]);

    rerender(<RolePicker idPrefix="t" value={[Role.OPERATIONS_MANAGER]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Warehouse staff/ }));
    expect(onChange).toHaveBeenLastCalledWith([Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF]);

    await userEvent.click(screen.getByRole('checkbox', { name: /Operations manager/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('cannot be changed while disabled', () => {
    render(<RolePicker idPrefix="t" value={[]} onChange={vi.fn()} disabled />);
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
  });
});
