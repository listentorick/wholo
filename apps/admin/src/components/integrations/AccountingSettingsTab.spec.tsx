import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountingSettingsTab } from './AccountingSettingsTab';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingConnectionStatusResponse } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: { updateConnectionSettings: vi.fn(), listSalesAccounts: vi.fn() },
}));

const mockUpdateSettings = adminAccountingApi.updateConnectionSettings as ReturnType<typeof vi.fn>;
const mockListAccounts = adminAccountingApi.listSalesAccounts as ReturnType<typeof vi.fn>;

const accounts = [
  { id: 'acct-200', code: '200', displayName: 'Sales' },
  { id: 'acct-260', code: '260', displayName: 'Other Revenue' },
];

const connection: AccountingConnectionStatusResponse = {
  provider: 'XERO',
  status: 'CONNECTED',
  externalOrganisationName: 'Acme Wines',
  connectedAt: '2026-01-01T00:00:00.000Z',
  lastSyncedAt: null,
  invoiceExportTargetStatus: 'DRAFT',
  invoiceDefaultAccount: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListAccounts.mockResolvedValue(accounts);
});

describe('AccountingSettingsTab', () => {
  it('preselects the connection-configured target status and disables save until changed', async () => {
    render(<AccountingSettingsTab connection={connection} onConnectionUpdated={vi.fn()} reloadSignal={0} />);

    expect(screen.getByRole('radio', { name: /Draft/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await screen.findByRole('option', { name: '200 — Sales' });
  });

  it('saves the selected status and reports the updated connection back to the page', async () => {
    const updated = { ...connection, invoiceExportTargetStatus: 'AUTHORISED' };
    mockUpdateSettings.mockResolvedValue(updated);
    const onConnectionUpdated = vi.fn();
    const user = userEvent.setup();

    render(
      <AccountingSettingsTab connection={connection} onConnectionUpdated={onConnectionUpdated} reloadSignal={0} />,
    );
    await user.click(screen.getByRole('radio', { name: /Authorised/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ invoiceExportTargetStatus: 'AUTHORISED' });
    await waitFor(() => expect(onConnectionUpdated).toHaveBeenCalledWith(updated));
  });

  it('shows an error message when saving fails', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<AccountingSettingsTab connection={connection} onConnectionUpdated={vi.fn()} reloadSignal={0} />);
    await user.click(screen.getByRole('radio', { name: /Submitted/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });

  describe('default sales account', () => {
    const sales = { id: 'acct-200', code: '200', displayName: 'Sales', isActive: true };

    it('lists the synced sales accounts after None, with None selected by default', async () => {
      render(<AccountingSettingsTab connection={connection} onConnectionUpdated={vi.fn()} reloadSignal={0} />);

      await screen.findByRole('option', { name: '200 — Sales' });
      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['None — leave it to your accounting system', '200 — Sales', '260 — Other Revenue']);
      expect(screen.getByLabelText('Default sales account')).toHaveValue('');
    });

    it('saves only the chosen account when only the account changed', async () => {
      mockUpdateSettings.mockResolvedValue(connection);
      const user = userEvent.setup();

      render(<AccountingSettingsTab connection={connection} onConnectionUpdated={vi.fn()} reloadSignal={0} />);
      await screen.findByRole('option', { name: '260 — Other Revenue' });
      await user.selectOptions(screen.getByLabelText('Default sales account'), 'acct-260');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockUpdateSettings).toHaveBeenCalledWith({ invoiceDefaultAccountId: 'acct-260' });
    });

    it('clears the default by sending null when None is chosen', async () => {
      mockUpdateSettings.mockResolvedValue(connection);
      const user = userEvent.setup();

      render(<AccountingSettingsTab connection={{ ...connection, invoiceDefaultAccount: sales }} onConnectionUpdated={vi.fn()} reloadSignal={0} />);
      await screen.findByRole('option', { name: '200 — Sales' });
      expect(screen.getByLabelText('Default sales account')).toHaveValue('acct-200');
      await user.selectOptions(screen.getByLabelText('Default sales account'), '');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockUpdateSettings).toHaveBeenCalledWith({ invoiceDefaultAccountId: null });
    });

    it('keeps an archived default selected, and says invoices no longer use it', async () => {
      const archived = { id: 'acct-210', code: '210', displayName: 'Old Sales', isActive: false };

      render(<AccountingSettingsTab connection={{ ...connection, invoiceDefaultAccount: archived }} onConnectionUpdated={vi.fn()} reloadSignal={0} />);

      await screen.findByRole('option', { name: '210 — Old Sales (no longer active)' });
      expect(screen.getByLabelText('Default sales account')).toHaveValue('acct-210');
      expect(screen.getByText(/archived or deleted in your accounting system/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('asks for a sync when no accounts have been synced yet', async () => {
      mockListAccounts.mockResolvedValueOnce([]);

      render(<AccountingSettingsTab connection={connection} onConnectionUpdated={vi.fn()} reloadSignal={0} />);

      expect(await screen.findByText(/No sales accounts have been synced yet/)).toBeInTheDocument();
    });

    it('shows an error and a retry when the accounts cannot be loaded', async () => {
      mockListAccounts.mockRejectedValueOnce(new Error('Failed to load accounts'));
      const user = userEvent.setup();

      render(<AccountingSettingsTab connection={connection} onConnectionUpdated={vi.fn()} reloadSignal={0} />);

      expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      await screen.findByRole('option', { name: '260 — Other Revenue' });
    });

    it('reloads the accounts when a sync finishes', async () => {
      const props = { connection, onConnectionUpdated: vi.fn() };
      mockListAccounts.mockResolvedValueOnce([accounts[0]]);
      const { rerender } = render(<AccountingSettingsTab {...props} reloadSignal={0} />);
      await screen.findByRole('option', { name: '200 — Sales' });
      expect(screen.queryByRole('option', { name: '260 — Other Revenue' })).not.toBeInTheDocument();

      rerender(<AccountingSettingsTab {...props} reloadSignal={1} />);

      await screen.findByRole('option', { name: '260 — Other Revenue' });
    });

    it('picks up the first synced accounts without leaving the tab', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mockListAccounts.mockResolvedValueOnce([]);
        render(<AccountingSettingsTab connection={connection} onConnectionUpdated={vi.fn()} reloadSignal={0} />);
        await screen.findByText(/No sales accounts have been synced yet/);

        await vi.advanceTimersByTimeAsync(5_000);

        await screen.findByRole('option', { name: '200 — Sales' });
        expect(screen.queryByText(/No sales accounts have been synced yet/)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
