import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersTab } from './OrdersTab';
import { OrderAcceptanceMode } from '@wholo/types';
import type { DistributorSettings } from '@wholo/types';

const baseSettings: DistributorSettings = {
  name: 'Acme Wines',
  email: null,
  phone: null,
  slug: null,
  addressLine1: null,
  addressLine2: null,
  addressCity: null,
  addressState: null,
  addressPostcode: null,
  addressCountry: null,
  defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
  marketplaceVisible: false,
  marketplaceDescription: null,
  tagline: null,
  aboutText: null,
  orderNotificationEmails: [],
  processingDays: [1, 2, 3, 4, 5],
  minimumOrderSpend: null,
};

describe('OrdersTab', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it('renders acceptance mode options', () => {
    render(<OrdersTab settings={baseSettings} onSave={onSave} />);

    expect(screen.getByText('Manual review')).toBeInTheDocument();
    expect(screen.getByText('Auto-accept on submission')).toBeInTheDocument();
  });

  it('pre-selects current acceptance mode', () => {
    render(<OrdersTab settings={baseSettings} onSave={onSave} />);

    const manual = screen.getByDisplayValue(OrderAcceptanceMode.MANUAL) as HTMLInputElement;
    expect(manual.checked).toBe(true);
  });

  it('renders processing day toggles', () => {
    render(<OrdersTab settings={baseSettings} onSave={onSave} />);

    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Saturday')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
  });

  it('saves both acceptance mode and processing days in one call', async () => {
    render(<OrdersTab settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByDisplayValue(OrderAcceptanceMode.AUTO_ON_SUBMISSION));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        defaultOrderAcceptanceMode: OrderAcceptanceMode.AUTO_ON_SUBMISSION,
        processingDays: [1, 2, 3, 4, 5],
      });
    });
  });

  it('toggles a processing day on and off', async () => {
    render(<OrdersTab settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ processingDays: [1, 2, 3, 4, 5, 6] }),
      );
    });
  });

  it('shows Saved after successful submit', async () => {
    render(<OrdersTab settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('shows error message when onSave rejects', async () => {
    onSave.mockRejectedValue(new Error('network error'));
    render(<OrdersTab settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
    });
  });
});
