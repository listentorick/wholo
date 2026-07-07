import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CartProvider, useCart } from './cart-context';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('./auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./distributor-context', () => ({
  useDistributor: vi.fn(),
}));

vi.mock('@wholo/api-client', () => ({
  cartApi: {
    getCart: vi.fn(),
    upsertItem: vi.fn(),
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useAuth } from './auth-context';
import { useDistributor } from './distributor-context';
import { cartApi } from '@wholo/api-client';

// ── Test harness ──────────────────────────────────────────────────────────────

function TestHarness() {
  const { quantities, inCart, adjustQty } = useCart();
  return (
    <div>
      <button onClick={() => adjustQty('prod-1', 1)}>increase</button>
      <button onClick={() => adjustQty('prod-1', -1)}>decrease</button>
      <span data-testid="qty">{quantities['prod-1'] ?? ''}</span>
      <span data-testid="in-cart">{inCart.has('prod-1') ? 'yes' : 'no'}</span>
    </div>
  );
}

function renderCart() {
  return render(
    <CartProvider distributorSlug="test-dist">
      <TestHarness />
    </CartProvider>,
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1' },
    accessToken: 'test-token',
  });
  (useDistributor as ReturnType<typeof vi.fn>).mockReturnValue({ hasRelationship: true });
  (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({ orderId: null, items: [] });
  (cartApi.upsertItem as ReturnType<typeof vi.fn>).mockResolvedValue({ orderId: null, items: [] });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CartProvider adjustQty', () => {
  it('persists the adjusted quantity via cartApi.upsertItem for a product not yet in the cart', async () => {
    renderCart();
    await waitFor(() => expect(cartApi.getCart).toHaveBeenCalled());

    fireEvent.click(screen.getByText('increase'));

    await waitFor(() => {
      expect(cartApi.upsertItem).toHaveBeenCalledWith(
        { distributorSlug: 'test-dist', productId: 'prod-1', quantity: 1 },
        'test-token',
      );
    });
  });

  it('persists the adjusted quantity via cartApi.upsertItem for a product already in the cart', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [{ productId: 'prod-1', quantity: 3, unitPrice: '1.00', product: { id: 'prod-1', name: 'Egg tarts', sku: null } }],
    });

    renderCart();
    await waitFor(() => expect(screen.getByTestId('in-cart').textContent).toBe('yes'));

    fireEvent.click(screen.getByText('increase'));

    await waitFor(() => {
      expect(cartApi.upsertItem).toHaveBeenCalledWith(
        { distributorSlug: 'test-dist', productId: 'prod-1', quantity: 4 },
        'test-token',
      );
    });
  });

  it('clamps the adjusted quantity to a minimum of 0', async () => {
    renderCart();
    await waitFor(() => expect(cartApi.getCart).toHaveBeenCalled());

    fireEvent.click(screen.getByText('decrease'));

    await waitFor(() => {
      expect(cartApi.upsertItem).toHaveBeenCalledWith(
        { distributorSlug: 'test-dist', productId: 'prod-1', quantity: 0 },
        'test-token',
      );
    });
  });
});
