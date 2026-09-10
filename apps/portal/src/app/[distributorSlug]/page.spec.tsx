import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ distributorSlug: 'winos' }),
  usePathname: () => '/winos',
}));

let mockAuthLoading = false;
let mockUser: unknown = { id: 'u1', organisationId: 'org-1' };
vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ user: mockUser, accessToken: 'tok', isLoading: mockAuthLoading }),
}));

let mockDistributor: DistributorInfo | null;
vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return {
    ...actual,
    useDistributor: () => ({ distributor: mockDistributor, relationshipStatus: 'ACTIVE' }),
  };
});
vi.mock('@/lib/cart-context', () => ({
  useCart: () => ({ quantities: {}, savingItems: new Set(), syncItem: vi.fn() }),
}));

const getProducts = vi.fn();
vi.mock('@wholo/api-client', () => ({
  catalogueApi: { getProducts: (...args: unknown[]) => getProducts(...args) },
}));

// Keep the chrome shallow — this spec is about orchestration + data flow.
vi.mock('@/components/storefront/StorefrontChrome', () => ({
  StorefrontChrome: ({
    tabs,
  }: {
    tabs: { mode: string; search?: string; onSearchChange?: (v: string) => void };
  }) => (
    <input
      aria-label="in-shop search"
      value={tabs.search ?? ''}
      onChange={(e) => tabs.onSearchChange?.(e.target.value)}
    />
  ),
}));
vi.mock('@/components/storefront/AboutSection', () => ({
  AboutSection: () => <div data-testid="about-section" data-order="2" />,
}));
vi.mock('@/components/storefront/DeliveryTermsSection', () => ({
  DeliveryTermsSection: () => <div data-testid="delivery-section" data-order="3" />,
}));
vi.mock('@/components/storefront/CatalogueSection', () => ({
  CatalogueSection: ({ products }: { products: Array<{ id: string; name: string }> }) => (
    <div data-testid="catalogue-section" data-order="1">
      {products.map((p) => (
        <span key={p.id}>{p.name}</span>
      ))}
    </div>
  ),
}));

import StorefrontPage from './page';

const distributor = { id: 'd1', name: 'Winos', slug: 'winos', currencyCode: 'GBP', bannerUrl: null, bannerDominantColor: null } as DistributorInfo;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthLoading = false;
  mockUser = { id: 'u1', organisationId: 'org-1' };
  mockDistributor = distributor;
  getProducts.mockResolvedValue({
    data: [{ id: 'p1', name: 'Pinot Noir' }],
    pagination: { total: 1, hasMore: false, nextCursor: null },
  });
});

describe('StorefrontPage', () => {
  it('shows a full-page spinner while the distributor is still loading', async () => {
    mockDistributor = null;
    getProducts.mockReturnValue(new Promise(() => {}));
    render(<StorefrontPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByTestId('catalogue-section')).toBeNull();
    await Promise.resolve();
  });

  it('renders the bands in order: catalogue → about → delivery', async () => {
    render(<StorefrontPage />);
    await waitFor(() => expect(screen.getByText('Pinot Noir')).toBeInTheDocument());
    const orders = screen
      .getAllByTestId(/section$/)
      .map((el) => el.getAttribute('data-order'));
    expect(orders).toEqual(['1', '2', '3']);
  });

  it('loads the first catalogue page and re-queries on debounced search', async () => {
    render(<StorefrontPage />);
    await waitFor(() => expect(getProducts).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('in-shop search'), { target: { value: 'rioja' } });
    await waitFor(() =>
      expect(getProducts).toHaveBeenLastCalledWith('winos', expect.objectContaining({ search: 'rioja' })),
    );
  });
});
