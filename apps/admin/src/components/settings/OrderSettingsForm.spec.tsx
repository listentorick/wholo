import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderSettingsForm } from './OrderSettingsForm';
import { OrderAcceptanceMode } from '@wholo/types';
import type { DistributorSettings } from '@wholo/types';

const baseSettings: DistributorSettings = {
  name: 'Acme Wines',
  email: null,
  phone: null,
  slug: null,
  defaultOrderAcceptanceMode: OrderAcceptanceMode.MANUAL,
  marketplaceVisible: false,
  marketplaceDescription: null,
  orderNotificationEmails: [],
};

describe('OrderSettingsForm', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
  });

  it('renders both radio options', () => {
    render(<OrderSettingsForm settings={baseSettings} onSave={onSave} />);

    expect(screen.getByText('Manual review')).toBeInTheDocument();
    expect(screen.getByText('Auto-accept on submission')).toBeInTheDocument();
  });

  it('pre-selects current mode', () => {
    render(<OrderSettingsForm settings={baseSettings} onSave={onSave} />);

    const manual = screen.getByDisplayValue(OrderAcceptanceMode.MANUAL) as HTMLInputElement;
    expect(manual.checked).toBe(true);
  });

  it('calls onSave with selected mode on submit', async () => {
    render(<OrderSettingsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByDisplayValue(OrderAcceptanceMode.AUTO_ON_SUBMISSION));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        defaultOrderAcceptanceMode: OrderAcceptanceMode.AUTO_ON_SUBMISSION,
      });
    });
  });

  it('shows Saved after successful submit', async () => {
    render(<OrderSettingsForm settings={baseSettings} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });
});
