import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportContactDialog } from './ImportContactDialog';
import { adminAccountingApi, ApiError } from '@wholo/admin-api-client';
import type { AccountingContactSummary } from '@wholo/types';

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return { ...actual, adminAccountingApi: { importContact: vi.fn() } };
});

const contact: AccountingContactSummary = {
  id: 'contact-1',
  displayName: 'Blackbird Vine & Co',
  email: null,
  externalContactCode: 'XC-1',
  externalAccountNumber: null,
  isCustomer: true,
  isSupplier: false,
  isArchived: false,
  ignoredAt: null,
  status: 'READY_TO_IMPORT',
  mapping: null,
  suggestion: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImportContactDialog', () => {
  it('pre-fills the customer name and account number from the cached contact', () => {
    render(<ImportContactDialog contact={contact} token="token-1" onClose={() => {}} onImported={() => {}} />);
    expect(screen.getByLabelText('Customer name')).toHaveValue('Blackbird Vine & Co');
    expect(screen.getByLabelText('Account number')).toHaveValue('XC-1');
  });

  it('imports the contact with the (possibly edited) fields and calls onImported', async () => {
    (adminAccountingApi.importContact as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tr-1' });
    const onImported = vi.fn();
    const user = userEvent.setup();

    render(<ImportContactDialog contact={contact} token="token-1" onClose={() => {}} onImported={onImported} />);
    await user.clear(screen.getByLabelText('Customer name'));
    await user.type(screen.getByLabelText('Customer name'), 'Renamed Co');
    await user.click(screen.getByText('Import customer'));

    await waitFor(() =>
      expect(adminAccountingApi.importContact).toHaveBeenCalledWith(
        'contact-1',
        { name: 'Renamed Co', accountNumber: 'XC-1' },
        'token-1',
      ),
    );
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it('shows an error and re-enables the form when import fails', async () => {
    (adminAccountingApi.importContact as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<ImportContactDialog contact={contact} token="token-1" onClose={() => {}} onImported={() => {}} />);
    await user.click(screen.getByText('Import customer'));

    await waitFor(() => expect(screen.getByText(/Failed to import this contact/)).toBeInTheDocument());
    expect(screen.getByText('Import customer')).not.toBeDisabled();
  });

  it('shows a field-level error under Account number on a 409 conflict, not the generic banner', async () => {
    (adminAccountingApi.importContact as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'This account number is already in use by another customer' }, 409),
    );
    const user = userEvent.setup();

    render(<ImportContactDialog contact={contact} token="token-1" onClose={() => {}} onImported={() => {}} />);
    await user.click(screen.getByText('Import customer'));

    await waitFor(() =>
      expect(screen.getByText('This account number is already in use by another customer')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Failed to import this contact/)).not.toBeInTheDocument();
  });

  it('never sends an email field, even implicitly', async () => {
    (adminAccountingApi.importContact as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tr-1' });
    const user = userEvent.setup();

    render(<ImportContactDialog contact={contact} token="token-1" onClose={() => {}} onImported={() => {}} />);
    await user.click(screen.getByText('Import customer'));

    await waitFor(() => expect(adminAccountingApi.importContact).toHaveBeenCalled());
    const dto = (adminAccountingApi.importContact as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(dto).not.toHaveProperty('email');
  });
});
