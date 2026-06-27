import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ProductDetailPage from './page';

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
    getProduct: vi.fn(),
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

const mockProduct = {
  id: 'prod-1',
  name: 'Egg tarts (box of 4)',
  description: 'These are the best egg tarts you will ever buy. Fresh from our oven!',
  sku: 'EGG-TART-4',
  price: '10.00',
  compareAtPrice: null,
  resolvedPrice: null,
  productType: { id: 'pt-1', name: 'box', code: 'box' },
  thumbnailUrl: null,
  imageUrl: 'https://cdn.example.com/images/egg-tarts.webp',
};

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

  (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
    distributorSlug: 'test-dist',
    productId: 'prod-1',
  });
  (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/test-dist/products/prod-1');
  (useRequireAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: mockUser,
    accessToken: 'test-token',
    isLoading: false,
  });
  (useCart as ReturnType<typeof vi.fn>).mockReturnValue(mockCart);
  (useDistributor as ReturnType<typeof vi.fn>).mockReturnValue({ hasRelationship: true });
  (catalogueApi.getProduct as ReturnType<typeof vi.fn>).mockResolvedValue(mockProduct);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProductDetailPage', () => {
  it('shows loading spinner while auth is loading', () => {
    (useRequireAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null,
      accessToken: null,
      isLoading: true,
    });

    render(<ProductDetailPage />);

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows loading spinner while product is fetching', async () => {
    (catalogueApi.getProduct as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<ProductDetailPage />);

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders product name as heading after load', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Egg tarts (box of 4)' })).toBeTruthy();
    });
  });

  it('renders formatted price with product type unit', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/\$10\.00 per box/)).toBeTruthy();
    });
  });

  it('renders price with ~ prefix when using base price (no resolvedPrice)', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/~\$10\.00/)).toBeTruthy();
    });
  });

  it('renders price without ~ prefix when resolvedPrice is set', async () => {
    (catalogueApi.getProduct as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProduct,
      resolvedPrice: '8.50',
    });

    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/\$8\.50 per box/)).toBeTruthy();
      expect(screen.queryByText(/~\$8\.50/)).toBeNull();
    });
  });

  it('renders hero image when imageUrl is present', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      const img = screen.getByAltText('Egg tarts (box of 4)');
      expect(img).toBeTruthy();
      expect((img as HTMLImageElement).src).toContain('egg-tarts.webp');
    });
  });

  it('renders placeholder div when imageUrl is null', async () => {
    (catalogueApi.getProduct as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProduct,
      imageUrl: null,
    });

    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.queryByAltText('Egg tarts (box of 4)')).toBeNull();
    });
  });

  it('renders product description in About section', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/best egg tarts/)).toBeTruthy();
    });
  });

  it('renders fallback text when description is null', async () => {
    (catalogueApi.getProduct as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProduct,
      description: null,
    });

    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('No description available.')).toBeTruthy();
    });
  });

  it('calls adjustQty with +1 when increase button is clicked', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => screen.getByRole('heading', { name: 'Egg tarts (box of 4)' }));

    const increaseBtn = screen.getByLabelText('Increase quantity');
    fireEvent.click(increaseBtn);

    expect(mockCart.adjustQty).toHaveBeenCalledWith('prod-1', 1);
  });

  it('calls adjustQty with -1 when decrease button is clicked', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => screen.getByRole('heading', { name: 'Egg tarts (box of 4)' }));

    const decreaseBtn = screen.getByLabelText('Decrease quantity');
    fireEvent.click(decreaseBtn);

    expect(mockCart.adjustQty).toHaveBeenCalledWith('prod-1', -1);
  });

  it('calls syncItem with productId and qty when Add button is clicked', async () => {
    render(<ProductDetailPage />);

    await waitFor(() => screen.getByRole('heading', { name: 'Egg tarts (box of 4)' }));

    const addBtn = screen.getByText('Add');
    fireEvent.click(addBtn);

    expect(mockCart.syncItem).toHaveBeenCalledWith('prod-1', 1);
  });

  it('shows Update button when product is already in cart', async () => {
    (useCart as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockCart,
      inCart: new Set(['prod-1']),
    });

    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Update')).toBeTruthy();
    });
  });

  it('shows … button while saving', async () => {
    (useCart as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockCart,
      savingItems: new Set(['prod-1']),
    });

    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('…')).toBeTruthy();
    });
  });

  it('shows error state when fetch fails', async () => {
    (catalogueApi.getProduct as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Product could not be loaded.')).toBeTruthy();
    });
  });

  it('hides stepper and add button when no active trade relationship', async () => {
    (useDistributor as ReturnType<typeof vi.fn>).mockReturnValue({ hasRelationship: false });

    render(<ProductDetailPage />);

    await waitFor(() => screen.getByRole('heading', { name: 'Egg tarts (box of 4)' }));

    expect(screen.queryByLabelText('Increase quantity')).toBeNull();
    expect(screen.queryByLabelText('Decrease quantity')).toBeNull();
    expect(screen.queryByText('Add')).toBeNull();
  });
});
