import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProofOfDeliveryForm } from './ProofOfDeliveryForm';

describe('ProofOfDeliveryForm', () => {
  it('keeps Continue disabled until a recipient name is entered, then trims and reports it', async () => {
    const onContinue = vi.fn();
    render(<ProofOfDeliveryForm onContinue={onContinue} onBack={vi.fn()} />);

    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Recipient name'), '  Alex Morgan  ');
    expect(cont).toBeEnabled();

    await userEvent.click(cont);
    expect(onContinue).toHaveBeenCalledWith('Alex Morgan');
  });

  it('has no photo controls this increment', () => {
    render(<ProofOfDeliveryForm onContinue={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByText(/photo/i)).not.toBeInTheDocument();
  });

  it('calls onBack from the Back button', async () => {
    const onBack = vi.fn();
    render(<ProofOfDeliveryForm onContinue={vi.fn()} onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
