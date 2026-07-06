import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessDetailsForm } from './BusinessDetailsForm';
import { OrderAcceptanceMode } from '@wholo/types';
import type { DistributorSettings } from '@wholo/types';

const baseSettings: DistributorSettings = {
  name: 'Acme Wines',
  email: 'hello@acme.com',
  phone: '+61400000000',
  slug: 'acme-wines',
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

describe('BusinessDetailsForm', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it('renders initial values', () => {
    render(<BusinessDetailsForm settings={baseSettings} onSave={onSave} />);

    expect(screen.getByDisplayValue('Acme Wines')).toBeInTheDocument();
    expect(screen.getByDisplayValue('hello@acme.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+61400000000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('acme-wines')).toBeInTheDocument();
  });

  it('shows portal URL hint when slug is set', () => {
    render(<BusinessDetailsForm settings={baseSettings} onSave={onSave} />);

    expect(screen.getByText(/acme-wines/)).toBeInTheDocument();
  });

  it('calls onSave with form values on submit', async () => {
    render(<BusinessDetailsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.change(screen.getByDisplayValue('Acme Wines'), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Name' }),
      );
    });
  });

  it('shows validation error when name is cleared', async () => {
    render(<BusinessDetailsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.change(screen.getByDisplayValue('Acme Wines'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/required/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows Saved after successful submit', async () => {
    render(<BusinessDetailsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('shows error message when onSave rejects', async () => {
    onSave.mockRejectedValue(new Error('network error'));
    render(<BusinessDetailsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
    });
  });
});
