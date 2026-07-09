import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    status: 'READY_TO_IMPORT',
    mapping: null,
    suggestion: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AccountingContactsTable', () => {
  it('shows a loading skeleton when loading with no contacts yet', () => {
    render(<AccountingContactsTable contacts={[]} loading hasFilter={false} token="t" onActionComplete={() => {}} />);
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 skeleton rows
  });

  it('shows an unfiltered empty state inviting the user to sync', () => {
    render(<AccountingContactsTable contacts={[]} loading={false} hasFilter={false} token="t" onActionComplete={() => {}} />);
    expect(screen.getByText('No contacts synced yet')).toBeInTheDocument();
    expect(screen.getByText('Click Sync now to pull contacts from Xero.')).toBeInTheDocument();
  });

  it('shows a filtered empty state when a status filter is active', () => {
    render(<AccountingContactsTable contacts={[]} loading={false} hasFilter token="t" onActionComplete={() => {}} />);
    expect(screen.getByText('No matching contacts')).toBeInTheDocument();
  });

  it('renders contact rows with name, email, account number, and status', () => {
    render(
      <AccountingContactsTable
        contacts={[makeContact()]}
        loading={false}
        hasFilter={false}
        token="t"
        onActionComplete={() => {}}
      />,
    );
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
        token="t"
        onActionComplete={() => {}}
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
        token="t"
        onActionComplete={() => {}}
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
        token="t"
        onActionComplete={() => {}}
      />,
    );
    expect(screen.getByText('Not a customer')).toBeInTheDocument();
  });
});
