import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProofOfDeliveryForm } from './ProofOfDeliveryForm';

const noopProps = {
  photos: [],
  onAddPhoto: vi.fn(),
  onRemovePhoto: vi.fn(),
  onRetryPhoto: vi.fn(),
  onEnter: vi.fn(),
  onContinue: vi.fn(),
  onBack: vi.fn(),
};

describe('ProofOfDeliveryForm', () => {
  it('keeps Continue disabled until a recipient name is entered, then trims and reports it', async () => {
    const onContinue = vi.fn();
    render(<ProofOfDeliveryForm {...noopProps} onContinue={onContinue} />);

    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Recipient name'), '  Alex Morgan  ');
    expect(cont).toBeEnabled();

    await userEvent.click(cont);
    expect(onContinue).toHaveBeenCalledWith('Alex Morgan');
  });

  it('captures device location once on entry', () => {
    const onEnter = vi.fn();
    const { rerender } = render(<ProofOfDeliveryForm {...noopProps} onEnter={onEnter} />);
    rerender(<ProofOfDeliveryForm {...noopProps} onEnter={onEnter} />);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('shows the optional delivery-photos section and does not gate Continue on photos', async () => {
    render(<ProofOfDeliveryForm {...noopProps} />);

    expect(screen.getByText('Delivery photos')).toBeInTheDocument();
    expect(screen.getByText(/add a photo of the delivery \(optional\)/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Recipient name'), 'Alex Morgan');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(); // no photo needed
  });

  it('calls onBack from the Back button', async () => {
    const onBack = vi.fn();
    render(<ProofOfDeliveryForm {...noopProps} onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
