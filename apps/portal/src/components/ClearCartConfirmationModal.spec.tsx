import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClearCartConfirmationModal } from './ClearCartConfirmationModal';

describe('ClearCartConfirmationModal', () => {
  it('asks the question using the item count, singular', () => {
    render(<ClearCartConfirmationModal itemCount={1} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Clear 1 item from your cart?')).toBeInTheDocument();
  });

  it('asks the question using the item count, plural', () => {
    render(<ClearCartConfirmationModal itemCount={4} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Clear 4 items from your cart?')).toBeInTheDocument();
  });

  it('calls onConfirm when "Clear Cart" is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ClearCartConfirmationModal itemCount={2} onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Cart' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });

  it('shows an inline error and re-enables the buttons when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network down'));
    render(<ClearCartConfirmationModal itemCount={2} onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Cart' }));
    await waitFor(() =>
      expect(screen.getByText('Failed to clear your cart. Please try again.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Clear Cart' })).not.toBeDisabled();
  });

  it('calls onClose without calling onConfirm when "Cancel" is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ClearCartConfirmationModal itemCount={2} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onClose without calling onConfirm when the close button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ClearCartConfirmationModal itemCount={2} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onClose without calling onConfirm when the backdrop is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <ClearCartConfirmationModal itemCount={2} onConfirm={onConfirm} onClose={onClose} />,
    );

    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not close when clicking inside the dialog card', () => {
    const onClose = vi.fn();
    render(<ClearCartConfirmationModal itemCount={2} onConfirm={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
