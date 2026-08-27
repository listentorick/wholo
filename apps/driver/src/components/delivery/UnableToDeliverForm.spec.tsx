import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnableToDeliverForm } from './UnableToDeliverForm';

describe('UnableToDeliverForm', () => {
  it('requires a reason before Review can be submitted', () => {
    render(<UnableToDeliverForm onContinue={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
  });

  it('continues once a non-Other reason is chosen, with no note required', async () => {
    const onContinue = vi.fn();
    render(<UnableToDeliverForm onContinue={onContinue} onBack={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'CUSTOMER_REFUSED');
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onContinue).toHaveBeenCalledWith({ unableReason: 'CUSTOMER_REFUSED', unableReasonNote: '' });
  });

  it('requires a note when the reason is Other, and blocks Review until one is entered', async () => {
    const onContinue = vi.fn();
    render(<UnableToDeliverForm onContinue={onContinue} onBack={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'OTHER');
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/note/i), 'Road closed for resurfacing');
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onContinue).toHaveBeenCalledWith({ unableReason: 'OTHER', unableReasonNote: 'Road closed for resurfacing' });
  });

  it('hides the note field entirely for a non-Other reason', async () => {
    render(<UnableToDeliverForm onContinue={vi.fn()} onBack={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'INCORRECT_ADDRESS');
    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument();
  });
});
