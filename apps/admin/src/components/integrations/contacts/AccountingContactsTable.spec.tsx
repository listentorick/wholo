import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountingContactsTable } from './AccountingContactsTable';
import type { AccountingContactSummary } from '@wholo/types';

function makeContact(overrides: Partial<AccountingContactSummary> = {}): AccountingContactSummary {
  return {
    id: 'contact-1',
    displayName: 'Blackbird Vine & Co',
    email: 'billing@blackbird.example',
    externalContactCode: 'XC-1',
    externalAccountNumber: null,
    isCustomer: true,
    isSupplier: false,
    isArchived: false,
    ignoredAt: null,
    changeDetectedAt: null,
    changeAcknowledgedAt: null,
    status: 'READY_TO_IMPORT',
    mapping: null,
    suggestion: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  token: 't',
  providerLabel: 'Xero',
  hasMore: false,
  isLoadingMore: false,
  onLoadMore: () => {},
  onActionComplete: () => {},
  selectedIds: new Set<string>(),
  selectAllMatching: false,
  total: 1,
  onToggleRow: () => {},
  onToggleAllLoaded: () => {},
  onSelectAllMatching: () => {},
};

describe('AccountingContactsTable', () => {
  it('shows a spinner and no rows while loading with no contacts yet', () => {
    render(<AccountingContactsTable contacts={[]} loading hasFilter={false} {...baseProps} />);
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });

  it('shows an unfiltered empty state inviting the user to sync', () => {
    render(<AccountingContactsTable contacts={[]} loading={false} hasFilter={false} {...baseProps} />);
    expect(screen.getByText('No contacts synced yet')).toBeInTheDocument();
    expect(screen.getByText('Click Sync now to pull contacts from Xero.')).toBeInTheDocument();
  });

  it('shows a filtered empty state when a status filter is active', () => {
    render(<AccountingContactsTable contacts={[]} loading={false} hasFilter {...baseProps} />);
    expect(screen.getByText('No matching contacts')).toBeInTheDocument();
  });

  it('renders contact rows with name, email, account number, and status', () => {
    render(<AccountingContactsTable contacts={[makeContact()]} loading={false} hasFilter={false} {...baseProps} />);
    expect(screen.getByText('Blackbird Vine & Co')).toBeInTheDocument();
    expect(screen.getByText('billing@blackbird.example')).toBeInTheDocument();
    expect(screen.getByText('XC-1')).toBeInTheDocument();
    expect(screen.getByText('Ready to import')).toBeInTheDocument();
  });

  it('renders the suggested customer name and match reason for a suggested contact', () => {
    render(
      <AccountingContactsTable
        contacts={[
          makeContact({
            status: 'SUGGESTED',
            suggestion: {
              id: 'sugg-1',
              tradeRelationshipId: 'tr-1',
              customerName: 'Blackbird Vine & Co',
              confidence: 95,
              matchMethod: 'ACCOUNT_CODE_EXACT',
              matchReason: 'Account number XC-1 matches',
            },
          }),
        ]}
        loading={false}
        hasFilter={false}
        {...baseProps}
      />,
    );
    expect(screen.getByText('Suggested match')).toBeInTheDocument();
    expect(screen.getByText('Account number XC-1 matches')).toBeInTheDocument();
  });

  it('renders a Conflict badge when the computed status is CONFLICT', () => {
    render(
      <AccountingContactsTable
        contacts={[makeContact({ status: 'CONFLICT' })]}
        loading={false}
        hasFilter={false}
        {...baseProps}
      />,
    );
    expect(screen.getByText('Conflict')).toBeInTheDocument();
  });

  it('renders a Not a customer badge for a supplier-only contact', () => {
    render(
      <AccountingContactsTable
        contacts={[makeContact({ status: 'NOT_A_CUSTOMER', isCustomer: false, isSupplier: true })]}
        loading={false}
        hasFilter={false}
        {...baseProps}
      />,
    );
    expect(screen.getByText('Not a customer')).toBeInTheDocument();
  });

  it('toggles a row checkbox via onToggleRow', async () => {
    const onToggleRow = vi.fn();
    render(
      <AccountingContactsTable contacts={[makeContact()]} loading={false} hasFilter={false} {...baseProps} onToggleRow={onToggleRow} />,
    );

    await userEvent.click(screen.getByLabelText('Select Blackbird Vine & Co'));
    expect(onToggleRow).toHaveBeenCalledWith('contact-1');
  });

  it('shows a "select all matching filters" banner only when more rows exist beyond the loaded page', () => {
    render(
      <AccountingContactsTable
        contacts={[makeContact()]}
        loading={false}
        hasFilter={false}
        {...baseProps}
        selectedIds={new Set(['contact-1'])}
        hasMore={true}
        total={50}
      />,
    );

    expect(screen.getByText(/Select all 50 contacts matching filters/)).toBeInTheDocument();
  });
});
