import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DeliveryTab } from './DeliveryTab';
import { TradeRelationshipStatus, type Customer, type DeliveryProfileSummary } from '@wholo/types';
import type { OnTabSaveStateChange } from './tab-save-state';

const { assignToCustomer } = vi.hoisted(() => ({
  assignToCustomer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return {
    ...actual,
    adminCustomersApi: { update: vi.fn().mockResolvedValue(undefined) },
    adminDeliveryProfilesApi: {
      list: vi.fn().mockResolvedValue({
        data: [
          { id: 'profile-1', name: 'Standard', active: true } as DeliveryProfileSummary,
          { id: 'profile-2', name: 'Express', active: true } as DeliveryProfileSummary,
        ],
        pagination: { nextCursor: null, hasMore: false, total: 2 },
      }),
      assignToCustomer,
    },
  };
});

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'rel-1',
    organisationId: 'org-1',
    distributorId: 'dist-1',
    status: TradeRelationshipStatus.ACTIVE,
    organisation: {
      id: 'org-1', name: 'Blackbird Kitchen', legalName: null, email: null, phone: null,
      addressLine1: null, addressLine2: null, addressCity: null, addressState: null, addressPostcode: null, addressCountry: null,
      billingLine1: null, billingLine2: null, billingCity: null, billingState: null, billingPostcode: null, billingCountry: null,
    },
    accountNumber: null, creditLimit: null, minimumOrderSpend: null, paymentTerms: null, notes: null,
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
  assignToCustomer.mockResolvedValue(undefined);
});

describe('DeliveryTab', () => {
  it('submits the newly selected delivery profile, not a stale one, on the first save after selection', async () => {
    let latestSaveState: Parameters<OnTabSaveStateChange>[0] | null = null;
    const onSaveStateChange = vi.fn((state) => {
      latestSaveState = state;
    });

    render(
      <DeliveryTab
        customer={makeCustomer({ deliveryProfileId: null })}
        token="token-1"
        mode="tab"
        onSaveStateChange={onSaveStateChange}
      />,
    );

    await waitFor(() => expect(screen.getByRole('option', { name: 'Express' })).toBeInTheDocument());

    act(() => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'profile-2' } });
    });

    await waitFor(() => {
      expect(latestSaveState).not.toBeNull();
    });

    await act(async () => {
      await latestSaveState!.onSave();
    });

    await waitFor(() => {
      expect(assignToCustomer).toHaveBeenCalledWith('token-1', 'rel-1', { deliveryProfileId: 'profile-2' });
    });
  });
});
