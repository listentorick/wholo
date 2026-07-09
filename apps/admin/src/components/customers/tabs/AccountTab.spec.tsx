import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountTab } from './AccountTab';
import { adminCustomersApi, ApiError } from '@wholo/admin-api-client';
import type { Customer } from '@wholo/types';

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return {
    ...actual,
    adminCustomersApi: { update: vi.fn() },
  };
});

const mockUpdate = adminCustomersApi.update as ReturnType<typeof vi.fn>;

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'rel-1',
    organisationId: 'org-1',
    distributorId: 'dist-1',
    status: 'ACTIVE' as Customer['status'],
    organisation: {
      id: 'org-1', name: 'Blackbird Kitchen', legalName: null, email: null, phone: null,
      addressLine1: null, addressLine2: null, addressCity: null, addressState: null, addressPostcode: null, addressCountry: null,
      billingLine1: null, billingLine2: null, billingCity: null, billingState: null, billingPostcode: null, billingCountry: null,
    },
    accountNumber: 'ACC-001',
    creditLimit: null,
    minimumOrderSpend: null,
    paymentTerms: null,
    notes: null,
    deliveryLine1: null, deliveryLine2: null, deliveryCity: null, deliveryState: null, deliveryPostcode: null, deliveryCountry: null,
    billingLine1: null, billingLine2: null, billingCity: null, billingState: null, billingPostcode: null, billingCountry: null,
    priceListId: null, priceList: null, deliveryProfileId: null, deliveryProfile: null,
    catalogues: [], invitations: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountTab', () => {
  it('pre-fills the account number from the customer', () => {
    render(<AccountTab customer={makeCustomer()} token="token-1" mode="tab" />);
    expect(screen.getByLabelText('Account number')).toHaveValue('ACC-001');
  });

  it('saves successfully and shows a Saved confirmation', async () => {
    mockUpdate.mockResolvedValue(makeCustomer());
    const user = userEvent.setup();

    render(<AccountTab customer={makeCustomer()} token="token-1" mode="tab" />);
    await user.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  it('shows a field-level error under Account number on a 409 conflict, not a generic banner', async () => {
    mockUpdate.mockRejectedValue(
      new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'This account number is already in use by another customer' }, 409),
    );
    const user = userEvent.setup();

    render(<AccountTab customer={makeCustomer()} token="token-1" mode="tab" />);
    await user.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(screen.getByText('This account number is already in use by another customer')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows the generic error banner for a non-conflict failure', async () => {
    mockUpdate.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();

    render(<AccountTab customer={makeCustomer()} token="token-1" mode="tab" />);
    await user.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
  });
});
