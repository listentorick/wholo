import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CustomerPage from './page';
import { TradeRelationshipStatus } from '@wholo/types';
import type { Customer } from '@wholo/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'rel-1' }),
  usePathname: () => '/customers/rel-1',
}));

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ isLoading: false }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('@/lib/hooks/use-query-param-tab', () => ({
  useQueryParamTab: () => ({ activeTab: 'overview', setTab: vi.fn() }),
}));

// AdminLayout pulls in the full app chrome (Sidebar, TopBar/notifications) —
// not the subject of this test, which is only the actions panel below it.
vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// The tabs aren't the subject of this test — stub them out so only the
// actions panel (built from customer.status) is under test.
vi.mock('@/components/customers/tabs/OverviewTab', () => ({ OverviewTab: () => null }));
vi.mock('@/components/customers/tabs/AccountTab', () => ({ AccountTab: () => null }));
vi.mock('@/components/customers/tabs/DeliveryTab', () => ({ DeliveryTab: () => null }));
vi.mock('@/components/customers/tabs/CataloguePricingTab', () => ({ CataloguePricingTab: () => null }));
vi.mock('@/components/customers/tabs/PortalAccessTab', () => ({ PortalAccessTab: () => null }));

const mockAcceptRequest = vi.fn();
const mockDeclineRequest = vi.fn();
const mockSuspend = vi.fn();
const mockUnsuspend = vi.fn();
const mockGet = vi.fn();

vi.mock('@wholo/admin-api-client', () => ({
  adminCustomersApi: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: vi.fn(),
    acceptRequest: (...args: unknown[]) => mockAcceptRequest(...args),
    declineRequest: (...args: unknown[]) => mockDeclineRequest(...args),
    suspend: (...args: unknown[]) => mockSuspend(...args),
    unsuspend: (...args: unknown[]) => mockUnsuspend(...args),
  },
  adminOrderAsApi: { createSession: vi.fn() },
}));

function makeCustomer(status: TradeRelationshipStatus, overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'rel-1',
    organisationId: 'org-1',
    distributorId: 'dist-1',
    status,
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
  } as Customer;
}

describe('CustomerPage — status transition actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcceptRequest.mockResolvedValue({});
    mockDeclineRequest.mockResolvedValue({});
    mockSuspend.mockResolvedValue({});
    mockUnsuspend.mockResolvedValue({});
  });

  it('shows Accept/Decline connection request for a PENDING_REQUEST customer, and no Suspend/Unsuspend/Remove', async () => {
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.PENDING_REQUEST));
    render(<CustomerPage />);

    await waitFor(() => expect(screen.getByText('Accept connection request')).toBeInTheDocument());
    expect(screen.getByText('Decline connection request')).toBeInTheDocument();
    expect(screen.queryByText('Suspend')).not.toBeInTheDocument();
    expect(screen.queryByText('Unsuspend')).not.toBeInTheDocument();
    // Not yet a real relationship — only Accept/Decline are valid dispositions.
    expect(screen.queryByText('Remove customer')).not.toBeInTheDocument();
  });

  it('Accept connection request opens a confirm modal before calling acceptRequest', async () => {
    mockGet.mockResolvedValue(
      makeCustomer(TradeRelationshipStatus.PENDING_REQUEST, {
        catalogues: [{ id: 'cat-1', name: 'Core range' }],
        priceListId: 'pl-1',
        priceList: { id: 'pl-1', name: 'Standard' },
        deliveryProfileId: 'dp-1',
        deliveryProfile: { id: 'dp-1', name: 'Default' },
      }),
    );
    render(<CustomerPage />);

    await waitFor(() => expect(screen.getByText('Accept connection request')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Accept connection request'));

    // First click only opens the confirm dialog — the API must not fire yet.
    expect(mockAcceptRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Catalogue/price list/delivery profile are all set, so no setup warning is shown.
    expect(screen.getByText(/will be notified and can start browsing/)).toBeInTheDocument();
    expect(screen.queryByText(/Heads up/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes, accept'));
    await waitFor(() => expect(mockAcceptRequest).toHaveBeenCalledWith('rel-1'));
    // Once for the initial load, once for the post-action refetch.
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('warns in the Accept dialog when catalogue, price list, or delivery profile are not set up', async () => {
    // makeCustomer defaults to no catalogues/priceListId/deliveryProfileId.
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.PENDING_REQUEST));
    render(<CustomerPage />);

    await waitFor(() => expect(screen.getByText('Accept connection request')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Accept connection request'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Heads up/)).toBeInTheDocument();
    expect(screen.getByText(/a catalogue, a price list, and a delivery profile/)).toBeInTheDocument();
    expect(screen.getByText(/You can still accept and configure this afterwards/)).toBeInTheDocument();

    // Still just a warning — accepting is unaffected.
    fireEvent.click(screen.getByText('Yes, accept'));
    await waitFor(() => expect(mockAcceptRequest).toHaveBeenCalledWith('rel-1'));
  });

  it('Decline request opens a confirm modal before calling declineRequest', async () => {
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.PENDING_REQUEST));
    render(<CustomerPage />);

    await waitFor(() => expect(screen.getByText('Decline connection request')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Decline connection request'));

    // First click only opens the confirm dialog — the API must not fire yet.
    expect(mockDeclineRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/will be notified and can request again later/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes, decline'));
    await waitFor(() => expect(mockDeclineRequest).toHaveBeenCalledWith('rel-1'));
  });

  it('shows Suspend (confirm-gated) for an ACTIVE customer, and no request/unsuspend actions', async () => {
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.ACTIVE));
    render(<CustomerPage />);

    await waitFor(() => expect(screen.getByText('Suspend')).toBeInTheDocument());
    expect(screen.queryByText('Accept connection request')).not.toBeInTheDocument();
    expect(screen.queryByText('Unsuspend')).not.toBeInTheDocument();
    // Remove customer is only hidden for PENDING_REQUEST — guard against over-hiding.
    expect(screen.getByText('Remove customer')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Suspend'));
    expect(mockSuspend).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Yes, suspend'));
    await waitFor(() => expect(mockSuspend).toHaveBeenCalledWith('rel-1'));
  });

  it('Unsuspend opens a confirm modal before calling unsuspend', async () => {
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.SUSPENDED));
    render(<CustomerPage />);

    await waitFor(() => expect(screen.getByText('Unsuspend')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Unsuspend'));

    expect(mockUnsuspend).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText("They'll immediately be able to browse and order again.")).toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes, unsuspend'));
    await waitFor(() => expect(mockUnsuspend).toHaveBeenCalledWith('rel-1'));
  });

  it('shows none of the transition actions for an ACTIVE-adjacent PENDING_INVITE customer', async () => {
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.PENDING_INVITE));
    render(<CustomerPage />);

    await waitFor(() => expect(screen.getByText('Remove customer')).toBeInTheDocument());
    expect(screen.queryByText('Accept connection request')).not.toBeInTheDocument();
    expect(screen.queryByText('Decline connection request')).not.toBeInTheDocument();
    expect(screen.queryByText('Suspend')).not.toBeInTheDocument();
    expect(screen.queryByText('Unsuspend')).not.toBeInTheDocument();
  });
});
