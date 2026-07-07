import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CataloguePage from './page';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: vi.fn(),
}));

vi.mock('@/lib/cart-context', () => ({
  useCart: vi.fn(),
}));

vi.mock('@/lib/distributor-context', () => ({
  useDistributor: vi.fn(),
}));

vi.mock('@wholo/api-client', () => ({
  catalogueApi: {
    getProducts: vi.fn(),
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { catalogueApi } from '@wholo/api-client';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'TRADE_CUSTOMER' as const,
  organisationId: 'org-1',
  organisationName: 'Test Org',
};

const makeProduct = (id: string, name: string) => ({
  id,
  name,
  description: null,
  sku: `SKU-${id}`,
  price: '10.00',
  compareAtPrice: null,
  resolvedPrice: null,
  productType: null,
  thumbnailUrl: null,
});

const makeResponse = (products: ReturnType<typeof makeProduct>[]) => ({
  distributor: { id: 'dist-1', name: 'Test Distributor' },
  data: products,
  pagination: { nextCursor: null, hasMore: false, total: products.length },
});

const mockCart = {
  quantities: {},
  inCart: new Set<string>(),
  savingItems: new Set<string>(),
  cartCount: 0,
  adjustQty: vi.fn(),
  syncItem: vi.fn(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ distributorSlug: 'test-dist' });
  (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/test-dist/products');
  (useRequireAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: mockUser,
    accessToken: 'test-token',
    isLoading: false,
  });
  (useCart as ReturnType<typeof vi.fn>).mockReturnValue(mockCart);
  (useDistributor as ReturnType<typeof vi.fn>).mockReturnValue({ hasRelationship: true });
  (catalogueApi.getProducts as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeResponse([makeProduct('prod-1', 'Egg tarts'), makeProduct('prod-2', 'Custard buns')]),
  );
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CataloguePage', () => {
  it('shows loading spinner while auth is loading', () => {
    (useRequireAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null,
      accessToken: null,
      isLoading: true,
    });

    render(<CataloguePage />);

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows loading spinner on initial fetch', () => {
    (catalogueApi.getProducts as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<CataloguePage />);

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders products with name, sku and price after load', async () => {
    render(<CataloguePage />);

    await waitFor(() => {
      expect(screen.getByText('Egg tarts')).toBeTruthy();
      expect(screen.getByText('Custard buns')).toBeTruthy();
      expect(screen.getByText('SKU-prod-1')).toBeTruthy();
      expect(screen.getAllByText('$10.00 per item')).toHaveLength(2);
    });
  });

  it('lays the list out as a responsive grid above mobile', async () => {
    render(<CataloguePage />);

    await waitFor(() => screen.getByText('Egg tarts'));

    const list = document.querySelector('ul');
    expect(list?.className).toContain('sm:grid-cols-2');
    expect(list?.className).toContain('lg:grid-cols-3');
  });

  it('refetches with the search param after typing (debounced)', async () => {
    render(<CataloguePage />);
    await waitFor(() => screen.getByText('Egg tarts'));

    (catalogueApi.getProducts as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([makeProduct('prod-1', 'Egg tarts')]),
    );

    fireEvent.change(screen.getByPlaceholderText('Search products…'), {
      target: { value: 'egg' },
    });

    await waitFor(() => {
      expect(catalogueApi.getProducts).toHaveBeenLastCalledWith('test-dist', 'test-token', {
        search: 'egg',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('Custard buns')).toBeNull();
      expect(screen.getByText('Egg tarts')).toBeTruthy();
    });
  });

  it('shows a search-specific empty state when nothing matches', async () => {
    render(<CataloguePage />);
    await waitFor(() => screen.getByText('Egg tarts'));

    (catalogueApi.getProducts as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse([]));

    fireEvent.change(screen.getByPlaceholderText('Search products…'), {
      target: { value: 'zzz' },
    });

    await waitFor(() => {
      expect(screen.getByText(/No products match/)).toBeTruthy();
      expect(screen.getByText(/zzz/)).toBeTruthy();
    });
  });

  it('shows the plain empty state when the catalogue has no products', async () => {
    (catalogueApi.getProducts as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse([]));

    render(<CataloguePage />);

    await waitFor(() => {
      expect(screen.getByText('No products available.')).toBeTruthy();
    });
  });

  it('shows error state when fetch fails', async () => {
    (catalogueApi.getProducts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    render(<CataloguePage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load products. Please try again.')).toBeTruthy();
    });
  });

  it('calls syncItem when Add is clicked', async () => {
    render(<CataloguePage />);
    await waitFor(() => screen.getByText('Egg tarts'));

    fireEvent.click(screen.getAllByText('Add')[0]);

    expect(mockCart.syncItem).toHaveBeenCalledWith('prod-1', 1);
  });

  it('hides stepper and add button when no active trade relationship', async () => {
    (useDistributor as ReturnType<typeof vi.fn>).mockReturnValue({ hasRelationship: false });

    render(<CataloguePage />);
    await waitFor(() => screen.getByText('Egg tarts'));

    expect(screen.queryByLabelText('Increase quantity')).toBeNull();
    expect(screen.queryByText('Add')).toBeNull();
  });
});
