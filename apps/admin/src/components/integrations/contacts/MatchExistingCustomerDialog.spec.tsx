import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchExistingCustomerDialog } from './MatchExistingCustomerDialog';
import { adminAccountingApi, adminCustomersApi } from '@wholo/admin-api-client';
import type { AccountingContactSummary, Customer } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: { matchContact: vi.fn() },
  adminCustomersApi: { list: vi.fn() },
}));

const contact: AccountingContactSummary = {
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
};

function makeCustomer(id: string, name: string): Customer {
  return {
    id,
    organisationId: `org-${id}`,
    distributorId: 'dist-1',
    status: 'ACTIVE',
    organisation: { id: `org-${id}`, name, legalName: null, email: null, phone: null, addressLine1: null, addressLine2: null, addressCity: null, addressState: null, addressPostcode: null, addressCountry: null },
    accountNumber: null,
    creditLimit: null,
    minimumOrderSpend: null,
    paymentTerms: null,
    notes: null,
    deliveryLine1: null,
    deliveryLine2: null,
    deliveryCity: null,
    deliveryState: null,
    deliveryPostcode: null,
    deliveryCountry: null,
    billingLine1: null,
    billingLine2: null,
    billingCity: null,
    billingState: null,
    billingPostcode: null,
    billingCountry: null,
    priceListId: null,
    priceList: null,
    deliveryProfileId: null,
    deliveryProfile: null,
    catalogues: [],
    invitations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Customer;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MatchExistingCustomerDialog', () => {
  it('loads and lists the distributor\'s existing customers', async () => {
    (adminCustomersApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeCustomer('tr-1', 'Blackbird Vine & Co'), makeCustomer('tr-2', 'Acme Wines')],
      pagination: { nextCursor: null, hasMore: false, total: 2 },
    });

    render(<MatchExistingCustomerDialog contact={contact} token="token-1" onClose={() => {}} onMatched={() => {}} />);

    await waitFor(() => expect(screen.getByText('Acme Wines')).toBeInTheDocument());
    expect(screen.getByText('Blackbird Vine & Co')).toBeInTheDocument();
  });

  it('filters the customer list as the user types', async () => {
    (adminCustomersApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeCustomer('tr-1', 'Blackbird Vine & Co'), makeCustomer('tr-2', 'Acme Wines')],
      pagination: { nextCursor: null, hasMore: false, total: 2 },
    });
    const user = userEvent.setup();

    render(<MatchExistingCustomerDialog contact={contact} token="token-1" onClose={() => {}} onMatched={() => {}} />);
    await waitFor(() => screen.getByText('Acme Wines'));

    await user.type(screen.getByLabelText('Search customers'), 'Acme');

    expect(screen.getByText('Acme Wines')).toBeInTheDocument();
    expect(screen.queryByText('Blackbird Vine & Co')).not.toBeInTheDocument();
  });

  it('links the selected customer and calls onMatched', async () => {
    (adminCustomersApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeCustomer('tr-1', 'Acme Wines')],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
    (adminAccountingApi.matchContact as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onMatched = vi.fn();
    const user = userEvent.setup();

    render(<MatchExistingCustomerDialog contact={contact} token="token-1" onClose={() => {}} onMatched={onMatched} />);
    await waitFor(() => screen.getByText('Acme Wines'));

    await user.click(screen.getByText('Acme Wines'));
    await user.click(screen.getByText('Link customer'));

    await waitFor(() =>
      expect(adminAccountingApi.matchContact).toHaveBeenCalledWith('contact-1', { tradeRelationshipId: 'tr-1' }, 'token-1'),
    );
    await waitFor(() => expect(onMatched).toHaveBeenCalled());
  });

  it('disables the Link button until a customer is selected', async () => {
    (adminCustomersApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [makeCustomer('tr-1', 'Acme Wines')],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
    render(<MatchExistingCustomerDialog contact={contact} token="token-1" onClose={() => {}} onMatched={() => {}} />);
    await waitFor(() => screen.getByText('Acme Wines'));
    expect(screen.getByText('Link customer')).toBeDisabled();
  });

  it('shows a load error when the customer list fails to load', async () => {
    (adminCustomersApi.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    render(<MatchExistingCustomerDialog contact={contact} token="token-1" onClose={() => {}} onMatched={() => {}} />);
    await waitFor(() => expect(screen.getByText('Failed to load customers.')).toBeInTheDocument());
  });
});
