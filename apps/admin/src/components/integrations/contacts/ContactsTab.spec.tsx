import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsTab } from './ContactsTab';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    listContacts: vi.fn(),
    syncContacts: vi.fn(),
  },
}));

const mockListContacts = adminAccountingApi.listContacts as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactsTab', () => {
  it('loads and renders contacts on mount', async () => {
    mockListContacts.mockResolvedValue({
      data: [makeContact('c1')],
      pagination: { nextCursor: null, hasMore: false },
    });

    render(<ContactsTab token="token-1" />);

    await waitFor(() => expect(screen.getByText('Contact c1')).toBeInTheDocument());
    expect(mockListContacts).toHaveBeenCalledWith(
      { limit: 20, cursor: undefined, status: undefined, type: undefined },
      'token-1',
    );
  });

  it('shows an error banner when the initial load fails', async () => {
    mockListContacts.mockRejectedValue(new Error('boom'));
    render(<ContactsTab token="token-1" />);
    await waitFor(() => expect(screen.getByText(/Failed to load contacts/)).toBeInTheDocument());
  });

  it('re-fetches with the selected status filter', async () => {
    mockListContacts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" />);
    await waitFor(() => expect(mockListContacts).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'SUGGESTED');

    await waitFor(() =>
      expect(mockListContacts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: 'SUGGESTED', type: undefined },
        'token-1',
      ),
    );
  });

  it('re-fetches with the selected type filter, composing with the status filter', async () => {
    mockListContacts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" />);
    await waitFor(() => expect(mockListContacts).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by type' }), 'suppliers');

    await waitFor(() =>
      expect(mockListContacts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: undefined, type: 'suppliers' },
        'token-1',
      ),
    );
  });

  it('loads the next page and appends results on Load more', async () => {
    mockListContacts
      .mockResolvedValueOnce({ data: [makeContact('c1')], pagination: { nextCursor: 'cursor-2', hasMore: true } })
      .mockResolvedValueOnce({ data: [makeContact('c2')], pagination: { nextCursor: null, hasMore: false } });
    const user = userEvent.setup();

    render(<ContactsTab token="token-1" />);
    await waitFor(() => expect(screen.getByText('Contact c1')).toBeInTheDocument());
    expect(screen.getByText('Load more')).toBeInTheDocument();

    await user.click(screen.getByText('Load more'));

    await waitFor(() => expect(screen.getByText('Contact c2')).toBeInTheDocument());
    expect(screen.getByText('Contact c1')).toBeInTheDocument();
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });
});
