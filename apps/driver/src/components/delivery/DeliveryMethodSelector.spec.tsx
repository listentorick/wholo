import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryMethodSelector } from './DeliveryMethodSelector';

describe('DeliveryMethodSelector', () => {
  it('keeps Continue disabled until a method is selected, then reports HANDED_TO_PERSON', async () => {
    const onContinue = vi.fn();
    render(<DeliveryMethodSelector onContinue={onContinue} onBack={vi.fn()} />);

    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: /handed to a person/i }));
    expect(cont).toBeEnabled();

    await userEvent.click(cont);
    expect(onContinue).toHaveBeenCalledWith('HANDED_TO_PERSON');
  });

  it('renders "Left in a safe location" as non-interactive with a Coming soon badge', () => {
    render(<DeliveryMethodSelector onContinue={vi.fn()} onBack={vi.fn()} />);

    expect(screen.queryByRole('radio', { name: /left in a safe location/i })).not.toBeInTheDocument();
    expect(screen.getByText('Left in a safe location')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('calls onBack from the Back button', async () => {
    const onBack = vi.fn();
    render(<DeliveryMethodSelector onContinue={vi.fn()} onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
