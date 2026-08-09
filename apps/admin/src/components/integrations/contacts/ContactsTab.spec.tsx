import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsTab } from './ContactsTab';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    listContacts: vi.fn(),
    syncContacts: vi.fn(),
    bulkImportContacts: vi.fn(),
  },
}));

const mockListContacts = adminAccountingApi.listContacts as ReturnType<typeof vi.fn>;
const mockBulkImportContacts = adminAccountingApi.bulkImportContacts as ReturnType<typeof vi.fn>;

function makeContact(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `Contact ${id}`,
    email: null,
    externalContactCode: null,
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
    ...overrides,
  };
}

async function addFilter(user: ReturnType<typeof userEvent.setup>, fieldValue: string, checkboxLabel: string) {
  await user.click(screen.getByRole('button', { name: 'Add filter' }));
  await user.selectOptions(screen.getByLabelText('Field'), fieldValue);
  await user.click(screen.getByLabelText(checkboxLabel));
  await user.click(screen.getByRole('button', { name: 'Apply →' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactsTab', () => {
  const DEFAULT_STATUS = ['SUGGESTED', 'READY_TO_IMPORT', 'LINKED', 'CONFLICT', 'IGNORED'];

  it('loads and renders contacts on mount, defaulting to customers only (excluding archived)', async () => {
    mockListContacts.mockResolvedValue({
      data: [makeContact('c1')],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });

    render(<ContactsTab token="token-1" providerLabel="Xero" />);

    await waitFor(() => expect(within(screen.getByRole('table')).getByText('Contact c1')).toBeInTheDocument());
    expect(mockListContacts).toHaveBeenCalledWith({ limit: 20, cursor: undefined, status: DEFAULT_STATUS }, 'token-1');
    // Renders as a normal, editable chip — not a hidden/baked-in constraint.
    expect(screen.getByRole('button', { name: /Status.*is.*Suggested match/ })).toBeInTheDocument();
  });

  it('lets the user clear the default filter and see every contact, including archived', async () => {
    mockListContacts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() =>
      expect(mockListContacts).toHaveBeenCalledWith({ limit: 20, cursor: undefined, status: DEFAULT_STATUS }, 'token-1'),
    );

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(mockListContacts).toHaveBeenLastCalledWith({ limit: 20, cursor: undefined }, 'token-1'));
  });

  it('shows an error banner when the initial load fails', async () => {
    mockListContacts.mockRejectedValue(new Error('boom'));
    render(<ContactsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(screen.getByText(/Failed to load contacts/)).toBeInTheDocument());
  });

  it('re-fetches with the selected status filter', async () => {
    mockListContacts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(mockListContacts).toHaveBeenCalledTimes(1));

    await addFilter(user, 'status', 'Suggested match');

    await waitFor(() =>
      expect(mockListContacts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: ['SUGGESTED'] },
        'token-1',
      ),
    );
  });

  it('re-fetches with the selected type filter, composing with the status filter', async () => {
    mockListContacts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(mockListContacts).toHaveBeenCalledTimes(1));

    await addFilter(user, 'status', 'Suggested match');
    await waitFor(() => expect(mockListContacts).toHaveBeenCalledTimes(2));

    await addFilter(user, 'type', 'Suppliers');

    await waitFor(() =>
      expect(mockListContacts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: ['SUGGESTED'], type: ['suppliers'] },
        'token-1',
      ),
    );
  });

  it('loads the next page and appends results on Load more', async () => {
    mockListContacts
      .mockResolvedValueOnce({
        data: [makeContact('c1')],
        pagination: { nextCursor: 'cursor-2', hasMore: true, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [makeContact('c2')],
        pagination: { nextCursor: null, hasMore: false, total: 2 },
      });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('Contact c1')).toBeInTheDocument());
    expect(screen.getByText('Load more')).toBeInTheDocument();

    await user.click(screen.getByText('Load more'));

    const table = within(screen.getByRole('table'));
    await waitFor(() => expect(table.getByText('Contact c2')).toBeInTheDocument());
    expect(table.getByText('Contact c1')).toBeInTheDocument();
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('selecting a row enables bulk import and queues an import with the selected ids', async () => {
    mockListContacts.mockResolvedValue({
      data: [makeContact('c1')],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
    mockBulkImportContacts.mockResolvedValue({ jobId: 'job-1' });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('Contact c1')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Bulk import' })).toBeDisabled();

    await user.click(within(screen.getByRole('table')).getByLabelText('Select Contact c1'));
    await user.click(screen.getByRole('button', { name: 'Bulk import (1)' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(mockBulkImportContacts).toHaveBeenCalledWith({ ids: ['c1'], honourSuggestions: false }, 'token-1'),
    );
    await waitFor(() => expect(screen.getByText(/Import queued/)).toBeInTheDocument());
  });
});
