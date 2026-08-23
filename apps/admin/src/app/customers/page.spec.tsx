import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Customer } from '@wholo/types';
import { TradeRelationshipStatus } from '@wholo/types';
import CustomersPage from './page';

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ isLoading: false }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Drawers are covered by their own specs — stubbed here so this test only
// asserts on which drawer gets opened with which id, not drawer internals.
vi.mock('@/components/customers/PriceListDrawer', () => ({
  PriceListDrawer: ({ priceListId }: { priceListId: string }) => <div data-testid="price-list-drawer">{priceListId}</div>,
}));
vi.mock('@/components/customers/CatalogueDrawer', () => ({
  CatalogueDrawer: ({ catalogueId }: { catalogueId: string }) => <div data-testid="catalogue-drawer">{catalogueId}</div>,
}));
vi.mock('@/components/customers/DeliveryProfileDrawer', () => ({
  DeliveryProfileDrawer: ({ deliveryProfileId }: { deliveryProfileId: string }) => (
    <div data-testid="delivery-profile-drawer">{deliveryProfileId}</div>
  ),
}));

const mockList = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminCustomersApi: { list: (...args: unknown[]) => mockList(...args) },
    adminPriceListsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
    adminDeliveryProfilesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
    adminCataloguesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  };
});

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    organisationId: 'org-1',
    distributorId: 'dist-1',
    status: TradeRelationshipStatus.ACTIVE,
    organisation: {
      id: 'org-1',
      name: 'Blackbird Kitchen',
      legalName: 'Blackbird Kitchen Ltd',
      email: 'peter@blackbird.com',
      phone: '020 7946 0958',
    } as Customer['organisation'],
    accountNumber: 'ACC-042',
    creditLimit: null,
    minimumOrderSpend: null,
    paymentTerms: null,
    notes: null,
    recentContactSelfDeclared: null,
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
    priceListId: 'pl-1',
    priceList: { id: 'pl-1', name: 'Trade Standard' },
    deliveryProfileId: 'dp-1',
    deliveryProfile: { id: 'dp-1', name: 'Weekly Yorkshire' },
    catalogues: [{ id: 'cat-1', name: 'Core Range' }],
    invitations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Customer;
}

// Desktop table and mobile card list both render in JSDOM at once — scope
// queries to whichever surface is under test.
describe('CustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      data: [makeCustomer()],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
  });

  describe('desktop table', () => {
    it('renders name, account number, phone, chips and status', async () => {
      render(<CustomersPage />);
      const table = within(await screen.findByRole('table'));

      expect(table.getByText('Blackbird Kitchen')).toBeInTheDocument();
      expect(table.getByText('ACC-042')).toBeInTheDocument();
      expect(table.getByText('020 7946 0958')).toBeInTheDocument();
      expect(table.getByText(/Core Range/)).toBeInTheDocument();
      expect(table.getByText(/Trade Standard/)).toBeInTheDocument();
      expect(table.getByText(/Weekly Yorkshire/)).toBeInTheDocument();
      expect(table.getByText('Active')).toBeInTheDocument();
    });
  });

  describe('mobile card list', () => {
    it('shows name, email, status, account number and phone collapsed', async () => {
      render(<CustomersPage />);
      const list = within(await screen.findByRole('list'));

      expect(list.getByText('Blackbird Kitchen')).toBeInTheDocument();
      expect(list.getByText('peter@blackbird.com')).toBeInTheDocument();
      expect(list.getByText('Active')).toBeInTheDocument();
      expect(list.getByText(/ACC-042 · 020 7946 0958/)).toBeInTheDocument();

      // The chips live in the expanded panel, which MobileCardList keeps
      // mounted (CSS-collapsed via grid-template-rows) rather than removing
      // from the DOM — jsdom doesn't evaluate that layout collapse, so the
      // signal to assert on is aria-expanded, same as AccountingProductsTable.spec.tsx.
      const toggle = list.getByRole('button', { name: /Blackbird Kitchen/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('reveals catalogue/price-list/delivery-profile chips and a View link when expanded', async () => {
      render(<CustomersPage />);
      const list = within(await screen.findByRole('list'));

      await userEvent.click(list.getByRole('button', { name: /Blackbird Kitchen/ }));

      expect(list.getByText(/Core Range/)).toBeInTheDocument();
      expect(list.getByText(/Trade Standard/)).toBeInTheDocument();
      expect(list.getByText(/Weekly Yorkshire/)).toBeInTheDocument();
      expect(list.getByRole('link', { name: /View customer/ })).toHaveAttribute('href', '/customers/cust-1');
    });

    it('opens the price list drawer when its chip is clicked', async () => {
      render(<CustomersPage />);
      const list = within(await screen.findByRole('list'));

      await userEvent.click(list.getByRole('button', { name: /Blackbird Kitchen/ }));
      await userEvent.click(list.getByRole('button', { name: /Trade Standard/ }));

      expect(await screen.findByTestId('price-list-drawer')).toHaveTextContent('pl-1');
    });
  });
});
