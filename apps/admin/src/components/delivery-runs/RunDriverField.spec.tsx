import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunDriverField } from './RunDriverField';

describe('RunDriverField', () => {
  it('shows "No driver assigned" when driverName is null', () => {
    render(<RunDriverField driverName={null} locked={false} saving={false} onSave={vi.fn()} />);
    expect(screen.getByText('No driver assigned')).toBeInTheDocument();
  });

  it('shows the driver name when set', () => {
    render(<RunDriverField driverName="Dave Walsh" locked={false} saving={false} onSave={vi.fn()} />);
    expect(screen.getByText('Dave Walsh')).toBeInTheDocument();
  });

  it('is not clickable/editable when locked', () => {
    render(<RunDriverField driverName="Dave Walsh" locked saving={false} onSave={vi.fn()} />);
    expect(screen.getByText('Dave Walsh')).toBeDisabled();
  });

  it('enters edit mode on click and calls onSave with the trimmed value on Save', async () => {
    const onSave = vi.fn();
    render(<RunDriverField driverName={null} locked={false} saving={false} onSave={onSave} />);

    await userEvent.click(screen.getByText('No driver assigned'));
    const input = screen.getByLabelText('Driver for this run — overrides the route default');
    await userEvent.type(input, '  Sam  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save driver' }));

    expect(onSave).toHaveBeenCalledWith('Sam');
  });

  it('calls onSave with null when the field is cleared to empty', async () => {
    const onSave = vi.fn();
    render(<RunDriverField driverName="Dave Walsh" locked={false} saving={false} onSave={onSave} />);

    await userEvent.click(screen.getByText('Dave Walsh'));
    const input = screen.getByLabelText('Driver for this run — overrides the route default');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Save driver' }));

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('does not call onSave when the value is unchanged', async () => {
    const onSave = vi.fn();
    render(<RunDriverField driverName="Dave Walsh" locked={false} saving={false} onSave={onSave} />);

    await userEvent.click(screen.getByText('Dave Walsh'));
    await userEvent.click(screen.getByRole('button', { name: 'Save driver' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('exits edit mode without saving on Escape', async () => {
    const onSave = vi.fn();
    render(<RunDriverField driverName={null} locked={false} saving={false} onSave={onSave} />);

    await userEvent.click(screen.getByText('No driver assigned'));
    const input = screen.getByLabelText('Driver for this run — overrides the route default');
    await userEvent.type(input, 'Sam{Escape}');

    expect(screen.getByText('No driver assigned')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
