import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CustomerPage from './page';
import { Permission, TradeRelationshipStatus } from '@wholo/types';
import type { AccountingCustomerLink, Customer } from '@wholo/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'org-1' }),
  usePathname: () => '/customers/rel-1',
}));

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ isLoading: false }),
}));

let mockPermissions: Permission[] = [];
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', user: { permissions: mockPermissions } }),
}));

// null = no ?tab= in the URL: the page's own default tab is shown.
let mockRequestedTab: string | null = null;
const mockSetTab = vi.fn();
vi.mock('@/lib/hooks/use-query-param-tab', () => ({
  useQueryParamTab: (defaultTab: string) => ({ activeTab: mockRequestedTab ?? defaultTab, setTab: mockSetTab }),
}));

vi.mock('@/lib/ingestion-sync-context', () => ({
  useIngestionSync: () => ({ reloadSignal: 0, triggerSync: vi.fn(), isSyncing: false }),
}));

// AdminLayout pulls in the full app chrome (Sidebar, TopBar/notifications) —
// not the subject of this test, which is only the actions panel below it.
vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// The tabs aren't the subject of this test — stub them out so only the
// actions panel (built from customer.status) is under test.
vi.mock('@/components/customers/tabs/DashboardTab', () => ({ DashboardTab: () => <p>Customer dashboard</p> }));
vi.mock('@/components/customers/tabs/OrdersInvoicesTab', () => ({ OrdersInvoicesTab: () => null }));
vi.mock('@/components/customers/tabs/OverviewTab', () => ({ OverviewTab: () => null }));
vi.mock('@/components/customers/tabs/AccountTab', () => ({ AccountTab: () => null }));
vi.mock('@/components/customers/tabs/DeliveryTab', () => ({ DeliveryTab: () => null }));
vi.mock('@/components/customers/tabs/CataloguePricingTab', () => ({ CataloguePricingTab: () => null }));
vi.mock('@/components/customers/tabs/PortalAccessTab', () => ({ PortalAccessTab: () => null }));
vi.mock('@/components/integrations/record-link/AccountingLinkSection', () => ({
  AccountingLinkSection: () => <p>Accounting link section</p>,
}));

const mockAcceptRequest = vi.fn();
const mockDeclineRequest = vi.fn();
const mockSuspend = vi.fn();
const mockUnsuspend = vi.fn();
const mockGet = vi.fn();
const mockGetCustomerAccountingLink = vi.fn();

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
  adminAccountingApi: {
    getCustomerAccountingLink: (...args: unknown[]) => mockGetCustomerAccountingLink(...args),
  },
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
    accountNumber: null, creditLimit: null, minimumOrderSpend: null, paymentTermId: null, paymentTerm: null, notes: null,
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
    await waitFor(() => expect(mockAcceptRequest).toHaveBeenCalledWith('org-1'));
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
    await waitFor(() => expect(mockAcceptRequest).toHaveBeenCalledWith('org-1'));
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
    await waitFor(() => expect(mockDeclineRequest).toHaveBeenCalledWith('org-1'));
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
    await waitFor(() => expect(mockSuspend).toHaveBeenCalledWith('org-1'));
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
    await waitFor(() => expect(mockUnsuspend).toHaveBeenCalledWith('org-1'));
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

describe('CustomerPage — tabs', () => {
  beforeEach(() => mockGet.mockReset());

  it('opens on the Dashboard tab, the first tab', async () => {
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.ACTIVE));
    render(<CustomerPage />);

    expect(await screen.findByText('Customer dashboard')).toBeInTheDocument();
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels.indexOf('Dashboard')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Dashboard')).toBeLessThan(labels.indexOf('Overview'));
  });
});

function makeLink(overrides: Partial<AccountingCustomerLink> = {}): AccountingCustomerLink {
  return {
    connection: { provider: 'FAKE', providerName: 'Fake Books', status: 'CONNECTED', lastSyncedAt: null },
    link: null,
    change: null,
    suggestion: null,
    history: [],
    ...overrides,
  } as AccountingCustomerLink;
}

const LINKED: AccountingCustomerLink['link'] = {
  mappingId: 'map-1',
  matchMethod: 'MANUAL',
  linkedAt: '2026-10-12T09:00:00.000Z',
  linkedBy: null,
  external: { id: 'ext-1', displayName: 'Blackbird Kitchen Ltd', code: null, email: null },
};

describe('CustomerPage — Integrations tab and link pill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [Permission.ACCOUNTING_READ];
    mockRequestedTab = null;
    mockGet.mockResolvedValue(makeCustomer(TradeRelationshipStatus.ACTIVE));
  });

  it('without ACCOUNTING_READ: no lookup, no Integrations tab', async () => {
    mockPermissions = [];
    render(<CustomerPage />);
    await screen.findByText('Customer dashboard');
    expect(mockGetCustomerAccountingLink).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Integrations' })).not.toBeInTheDocument();
  });

  it('with no accounting connection: no Integrations tab and no pill', async () => {
    mockGetCustomerAccountingLink.mockResolvedValue({ connection: null, link: null, change: null, suggestion: null, history: [] });
    render(<CustomerPage />);
    await screen.findByText('Customer dashboard');
    await waitFor(() => expect(mockGetCustomerAccountingLink).toHaveBeenCalledWith('org-1'));
    expect(screen.queryByRole('button', { name: 'Integrations' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Not linked/)).not.toBeInTheDocument();
  });

  it('shows the Integrations tab and no pill when the customer is linked', async () => {
    mockGetCustomerAccountingLink.mockResolvedValue(makeLink({ link: LINKED }));
    render(<CustomerPage />);
    expect(await screen.findByRole('button', { name: 'Integrations' })).toBeInTheDocument();
    expect(screen.queryByText(/Not linked|Changed in/)).not.toBeInTheDocument();
  });

  it.each([
    ['not linked', makeLink(), 'Not linked'],
    [
      'not linked with a suggestion',
      makeLink({
        suggestion: {
          id: 's-1', confidence: 95, matchMethod: 'EMAIL_EXACT', matchReason: 'Same email',
          external: { id: 'ext-1', displayName: 'Blackbird Kitchen Ltd', code: null, email: null },
        },
      }),
      'Not linked · match found',
    ],
    ['changed in the provider', makeLink({ link: LINKED, change: { detectedAt: '2026-10-24T08:00:00.000Z' } }), 'Changed in Fake Books'],
  ])('pill for %s opens the Integrations tab', async (_state, link, label) => {
    mockGetCustomerAccountingLink.mockResolvedValue(link);
    render(<CustomerPage />);
    fireEvent.click(await screen.findByRole('button', { name: label }));
    expect(mockSetTab).toHaveBeenCalledWith('integrations');
  });

  it('?tab=integrations renders the accounting section', async () => {
    mockRequestedTab = 'integrations';
    mockGetCustomerAccountingLink.mockResolvedValue(makeLink({ link: LINKED }));
    render(<CustomerPage />);
    expect(await screen.findByText('Accounting link section')).toBeInTheDocument();
  });

  it('?tab=integrations waits for the link instead of flashing the Dashboard', async () => {
    mockRequestedTab = 'integrations';
    mockGetCustomerAccountingLink.mockReturnValue(new Promise(() => {}));
    render(<CustomerPage />);
    expect(await screen.findByRole('button', { name: 'Integrations' })).toBeInTheDocument();
    expect(screen.queryByText('Customer dashboard')).not.toBeInTheDocument();
  });

  it('?tab=integrations without a connection falls back to the Dashboard', async () => {
    mockRequestedTab = 'integrations';
    mockGetCustomerAccountingLink.mockResolvedValue({ connection: null, link: null, change: null, suggestion: null, history: [] });
    render(<CustomerPage />);
    expect(await screen.findByText('Customer dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Accounting link section')).not.toBeInTheDocument();
  });
});
