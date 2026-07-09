import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactRowActions } from './ContactRowActions';
import { adminAccountingApi, adminCustomersApi } from '@wholo/admin-api-client';
import type { AccountingContactSummary } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    confirmSuggestion: vi.fn(),
    ignoreContact: vi.fn(),
    unlinkMapping: vi.fn(),
    importContact: vi.fn(),
    matchContact: vi.fn(),
  },
  adminCustomersApi: {
    list: vi.fn().mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } }),
  },
}));

function makeContact(overrides: Partial<AccountingContactSummary> = {}): AccountingContactSummary {
  return {
    id: 'contact-1',
    displayName: 'Blackbird Vine & Co',
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
  (adminCustomersApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false, total: 0 },
  });
});

describe('ContactRowActions', () => {
  it('confirms a suggested match', async () => {
    (adminAccountingApi.confirmSuggestion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onActionComplete = vi.fn();
    const contact = makeContact({
      status: 'SUGGESTED',
      suggestion: {
        id: 'sugg-1',
        tradeRelationshipId: 'tr-1',
        customerName: 'Blackbird Vine & Co',
        confidence: 95,
        matchMethod: 'ACCOUNT_CODE_EXACT',
        matchReason: 'Account number matches',
      },
    });
    const user = userEvent.setup();

    render(<ContactRowActions contact={contact} token="token-1" onActionComplete={onActionComplete} />);
    await user.click(screen.getByText('Confirm match'));

    await waitFor(() => expect(adminAccountingApi.confirmSuggestion).toHaveBeenCalledWith('sugg-1', 'token-1'));
    await waitFor(() => expect(onActionComplete).toHaveBeenCalled());
  });

  it('ignores a contact', async () => {
    (adminAccountingApi.ignoreContact as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onActionComplete = vi.fn();
    const user = userEvent.setup();

    render(<ContactRowActions contact={makeContact()} token="token-1" onActionComplete={onActionComplete} />);
    await user.click(screen.getByText('Ignore'));

    await waitFor(() => expect(adminAccountingApi.ignoreContact).toHaveBeenCalledWith('contact-1', 'token-1'));
    await waitFor(() => expect(onActionComplete).toHaveBeenCalled());
  });

  it('opens the import dialog for a ready-to-import contact', async () => {
    const user = userEvent.setup();
    render(<ContactRowActions contact={makeContact()} token="token-1" onActionComplete={() => {}} />);

    await user.click(screen.getByText('Import as new'));

    expect(screen.getByText('Import as new customer')).toBeInTheDocument();
  });

  it('opens the match dialog for a ready-to-import contact', async () => {
    const user = userEvent.setup();
    render(<ContactRowActions contact={makeContact()} token="token-1" onActionComplete={() => {}} />);

    await user.click(screen.getByText('Match to existing'));

    expect(screen.getByText('Match to existing customer')).toBeInTheDocument();
  });

  it('shows a View customer link and Unlink button for a linked contact', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (adminAccountingApi.unlinkMapping as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onActionComplete = vi.fn();
    const contact = makeContact({
      status: 'LINKED',
      mapping: {
        id: 'mapping-1',
        tradeRelationshipId: 'tr-1',
        customerName: 'Blackbird Vine & Co',
        matchMethod: 'MANUAL',
        linkedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const user = userEvent.setup();

    render(<ContactRowActions contact={contact} token="token-1" onActionComplete={onActionComplete} />);
    expect(screen.getByText('View customer').closest('a')).toHaveAttribute('href', '/customers/tr-1');

    await user.click(screen.getByText('Unlink'));

    await waitFor(() => expect(adminAccountingApi.unlinkMapping).toHaveBeenCalledWith('mapping-1', 'token-1'));
    await waitFor(() => expect(onActionComplete).toHaveBeenCalled());
  });

  it('shows no actions for an archived contact', () => {
    render(<ContactRowActions contact={makeContact({ status: 'ARCHIVED' })} token="token-1" onActionComplete={() => {}} />);
    expect(screen.getByText('Archived in Xero')).toBeInTheDocument();
    expect(screen.queryByText('Import as new')).not.toBeInTheDocument();
  });

  it('shows an error message when an action fails', async () => {
    (adminAccountingApi.ignoreContact as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<ContactRowActions contact={makeContact()} token="token-1" onActionComplete={() => {}} />);
    await user.click(screen.getByText('Ignore'));

    await waitFor(() => expect(screen.getByText('That action failed. Please try again.')).toBeInTheDocument());
  });
});
