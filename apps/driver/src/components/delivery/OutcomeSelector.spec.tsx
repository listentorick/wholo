import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutcomeSelector } from './OutcomeSelector';

describe('OutcomeSelector', () => {
  it('calls onSelect with DELIVERED when the Deliver option is tapped', async () => {
    const onSelect = vi.fn();
    render(<OutcomeSelector onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Deliver' }));

    expect(onSelect).toHaveBeenCalledWith('DELIVERED');
  });

  it('calls onSelect with UNABLE_TO_DELIVER when that option is tapped', async () => {
    const onSelect = vi.fn();
    render(<OutcomeSelector onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Unable to deliver' }));

    expect(onSelect).toHaveBeenCalledWith('UNABLE_TO_DELIVER');
  });

  it('renders Partially delivered as a non-interactive, unclickable element — no button role at all', () => {
    render(<OutcomeSelector onSelect={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /partially delivered/i })).not.toBeInTheDocument();
    expect(screen.getByText('Partially delivered')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('never displays pricing', () => {
    render(<OutcomeSelector onSelect={vi.fn()} />);
    expect(screen.queryByText(/£|\$|price/i)).not.toBeInTheDocument();
  });
});
