import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AccountTab } from './AccountTab';
import { adminCustomersApi, ApiError } from '@wholo/admin-api-client';
import type { Customer } from '@wholo/types';
import type { TabSaveState } from './tab-save-state';

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
    recentContactSelfDeclared: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountTab', () => {
  it('pre-fills the account number from the customer', () => {
    render(<AccountTab customer={makeCustomer()} mode="tab" />);
    expect(screen.getByLabelText('Account number')).toHaveValue('ACC-001');
  });

  it('registers a save state with the sidebar via onSaveStateChange', () => {
    const onSaveStateChange = vi.fn();
    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);
    expect(onSaveStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Save', saving: false, onSave: expect.any(Function) }),
    );
  });

  it('clears the registered save state on unmount', () => {
    const onSaveStateChange = vi.fn();
    const { unmount } = render(
      <AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />,
    );
    onSaveStateChange.mockClear();
    unmount();
    expect(onSaveStateChange).toHaveBeenCalledWith(null);
  });

  it('saves successfully and reports the Saved state through onSaveStateChange', async () => {
    mockUpdate.mockResolvedValue(makeCustomer());
    const captured: { state: TabSaveState | null } = { state: null };
    const onSaveStateChange = vi.fn((state: TabSaveState | null) => {
      captured.state = state;
    });

    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);

    await act(async () => {
      captured.state?.onSave();
    });

    await waitFor(() => expect(captured.state?.success).toBe('Saved'));
  });

  it('shows a field-level error under Account number on a 409 conflict, not a generic save-state error', async () => {
    mockUpdate.mockRejectedValue(
      new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'This account number is already in use by another customer' }, 409),
    );
    const captured: { state: TabSaveState | null } = { state: null };
    const onSaveStateChange = vi.fn((state: TabSaveState | null) => {
      captured.state = state;
    });

    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);

    await act(async () => {
      captured.state?.onSave();
    });

    await waitFor(() =>
      expect(screen.getByText('This account number is already in use by another customer')).toBeInTheDocument(),
    );
    expect(captured.state?.error).toBeFalsy();
  });

  it('reports the generic error through onSaveStateChange for a non-conflict failure', async () => {
    mockUpdate.mockRejectedValue(new Error('network down'));
    const captured: { state: TabSaveState | null } = { state: null };
    const onSaveStateChange = vi.fn((state: TabSaveState | null) => {
      captured.state = state;
    });

    render(<AccountTab customer={makeCustomer()} mode="tab" onSaveStateChange={onSaveStateChange} />);

    await act(async () => {
      captured.state?.onSave();
    });

    await waitFor(() => expect(captured.state?.error).toBe('network down'));
  });
});
