import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountingSettingsTab } from './AccountingSettingsTab';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingConnectionStatusResponse } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: { updateConnectionSettings: vi.fn() },
}));

const mockUpdateSettings = adminAccountingApi.updateConnectionSettings as ReturnType<typeof vi.fn>;

const connection: AccountingConnectionStatusResponse = {
  provider: 'XERO',
  status: 'CONNECTED',
  externalOrganisationName: 'Acme Wines',
  connectedAt: '2026-01-01T00:00:00.000Z',
  lastSyncedAt: null,
  invoiceExportTargetStatus: 'DRAFT',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountingSettingsTab', () => {
  it('preselects the connection-configured target status and disables save until changed', () => {
    render(<AccountingSettingsTab token="token-1" connection={connection} onConnectionUpdated={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /Draft/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the selected status and reports the updated connection back to the page', async () => {
    const updated = { ...connection, invoiceExportTargetStatus: 'AUTHORISED' };
    mockUpdateSettings.mockResolvedValue(updated);
    const onConnectionUpdated = vi.fn();
    const user = userEvent.setup();

    render(
      <AccountingSettingsTab token="token-1" connection={connection} onConnectionUpdated={onConnectionUpdated} />,
    );
    await user.click(screen.getByRole('radio', { name: /Authorised/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ invoiceExportTargetStatus: 'AUTHORISED' }, 'token-1');
    await waitFor(() => expect(onConnectionUpdated).toHaveBeenCalledWith(updated));
  });

  it('shows an error message when saving fails', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<AccountingSettingsTab token="token-1" connection={connection} onConnectionUpdated={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /Submitted/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });
});
