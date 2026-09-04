import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTab } from './OverviewTab';
import { TradeRelationshipStatus, type Customer } from '@wholo/types';

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return {
    ...actual,
    adminCustomersApi: { update: vi.fn() },
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
});

describe('OverviewTab', () => {
  it('shows the connection request banner for a PENDING_REQUEST customer', () => {
    render(
      <OverviewTab customer={makeCustomer({ status: TradeRelationshipStatus.PENDING_REQUEST })} />,
    );
    expect(screen.getByText('Connection request pending')).toBeInTheDocument();
    expect(screen.getByText(/Blackbird Kitchen wants to connect/)).toBeInTheDocument();
  });

  it('does not show the banner for an ACTIVE customer', () => {
    render(<OverviewTab customer={makeCustomer({ status: TradeRelationshipStatus.ACTIVE })} />);
    expect(screen.queryByText('Connection request pending')).not.toBeInTheDocument();
  });

  it('still renders the editable business details form for a PENDING_REQUEST customer', () => {
    render(
      <OverviewTab customer={makeCustomer({ status: TradeRelationshipStatus.PENDING_REQUEST })} />,
    );
    expect(screen.getByLabelText('Business name')).not.toBeDisabled();
  });

  it('pre-fills the business name from the customer', () => {
    render(<OverviewTab customer={makeCustomer()} />);
    expect(screen.getByLabelText('Business name')).toHaveValue('Blackbird Kitchen');
  });

  it('registers a save state with the sidebar via onSaveStateChange', () => {
    const onSaveStateChange = vi.fn();
    render(<OverviewTab customer={makeCustomer()} onSaveStateChange={onSaveStateChange} />);
    expect(onSaveStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Save', saving: false, onSave: expect.any(Function) }),
    );
  });
});
