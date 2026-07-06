import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsForm } from './NotificationsForm';
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
  orderNotificationEmails: ['existing@acme.com'],
  processingDays: [1, 2, 3, 4, 5],
  minimumOrderSpend: null,
};

describe('NotificationsForm', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it('renders existing email addresses as chips', () => {
    render(<NotificationsForm settings={baseSettings} onSave={onSave} />);

    expect(screen.getByText('existing@acme.com')).toBeInTheDocument();
  });

  it('shows empty state when no emails', () => {
    render(
      <NotificationsForm
        settings={{ ...baseSettings, orderNotificationEmails: [] }}
        onSave={onSave}
      />,
    );

    expect(screen.getByText(/no notification emails/i)).toBeInTheDocument();
  });

  it('adds a new email when Add is clicked', async () => {
    render(<NotificationsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText(/orders@acme.com/i), {
      target: { value: 'new@acme.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText('new@acme.com')).toBeInTheDocument();
    });
  });

  it('removes an email when X is clicked', async () => {
    render(<NotificationsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByLabelText('Remove existing@acme.com'));

    await waitFor(() => {
      expect(screen.queryByText('existing@acme.com')).not.toBeInTheDocument();
    });
  });

  it('calls onSave with current email list when Save is clicked', async () => {
    render(<NotificationsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        orderNotificationEmails: ['existing@acme.com'],
      });
    });
  });

  it('shows Saved after successful save', async () => {
    render(<NotificationsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });
});
