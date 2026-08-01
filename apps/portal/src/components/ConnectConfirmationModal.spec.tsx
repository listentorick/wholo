import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectConfirmationModal } from './ConnectConfirmationModal';

describe('ConnectConfirmationModal', () => {
  it('asks the question using the distributor name', () => {
    render(
      <ConnectConfirmationModal distributorName="Blackbird Wines" onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(
      screen.getByText('Have you spoken with or ordered from Blackbird Wines in the last 90 days?'),
    ).toBeInTheDocument();
  });

  it('calls onConfirm(true) when "Yes" is answered', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ConnectConfirmationModal distributorName="Blackbird Wines" onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Yes, we're already in touch/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(true));
  });

  it('calls onConfirm(false) when "No" is answered', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ConnectConfirmationModal distributorName="Blackbird Wines" onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /No, this is a first introduction/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(false));
  });

  it('shows an inline error and re-enables the buttons when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network down'));
    render(<ConnectConfirmationModal distributorName="Blackbird Wines" onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Yes, we're already in touch/ }));
    await waitFor(() =>
      expect(screen.getByText('Failed to send your request. Please try again.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Yes, we're already in touch/ })).not.toBeDisabled();
  });

  it('calls onClose without calling onConfirm when the close button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConnectConfirmationModal distributorName="Blackbird Wines" onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onClose without calling onConfirm when the backdrop is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <ConnectConfirmationModal distributorName="Blackbird Wines" onConfirm={onConfirm} onClose={onClose} />,
    );

    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not close when clicking inside the dialog card', () => {
    const onClose = vi.fn();
    render(<ConnectConfirmationModal distributorName="Blackbird Wines" onConfirm={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
