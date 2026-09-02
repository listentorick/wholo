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
  const { items, quantities, inCart, syncItem, subtotal, taxAmount, taxLabel, total } = useCart();
  return (
    <div>
      <button onClick={() => syncItem('prod-1', Math.max(0, (quantities['prod-1'] ?? 0) + 1))}>increase</button>
      <button onClick={() => syncItem('prod-1', Math.max(0, (quantities['prod-1'] ?? 0) - 1))}>decrease</button>
      <span data-testid="order">{items.map((i) => i.product.name).join(',')}</span>
      <span data-testid="qty">{quantities['prod-1'] ?? ''}</span>
      <span data-testid="in-cart">{inCart.has('prod-1') ? 'yes' : 'no'}</span>
      <span data-testid="subtotal">{subtotal}</span>
      <span data-testid="tax">{taxAmount}</span>
      <span data-testid="tax-label">{taxLabel}</span>
      <span data-testid="total">{total}</span>
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
  (useDistributor as ReturnType<typeof vi.fn>).mockReturnValue({ relationshipStatus: 'ACTIVE' });
  (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({ orderId: null, items: [], subtotal: '0.00', taxAmount: '0.00', total: '0.00', taxLabel: 'Tax' });
  (cartApi.upsertItem as ReturnType<typeof vi.fn>).mockResolvedValue({ orderId: null, items: [], subtotal: '0.00', taxAmount: '0.00', total: '0.00', taxLabel: 'Tax' });
});

function cartItem(overrides: Record<string, unknown> = {}) {
  return {
    productId: 'prod-1',
    quantity: 1,
    unitPrice: '2.50',
    taxRatePercentage: '20.00',
    taxAmount: '0.50',
    taxTypeName: 'VAT',
    product: { id: 'prod-1', name: 'Egg tarts', sku: null },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CartProvider subtotal', () => {
  it('computes subtotal from quantities and unit price', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [cartItem({ quantity: 3, unitPrice: '2.50' })],
      subtotal: '7.50', taxAmount: '1.50', total: '9.00', taxLabel: 'VAT',
    });

    renderCart();

    await waitFor(() => expect(screen.getByTestId('subtotal').textContent).toBe('7.5'));
  });

  it('reflects an optimistic quantity change before the server confirms it', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [cartItem({ quantity: 1, unitPrice: '2.50' })],
      subtotal: '2.50', taxAmount: '0.50', total: '3.00', taxLabel: 'VAT',
    });
    (cartApi.upsertItem as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    renderCart();
    await waitFor(() => expect(screen.getByTestId('subtotal').textContent).toBe('2.5'));

    fireEvent.click(screen.getByText('increase'));

    await waitFor(() => expect(screen.getByTestId('subtotal').textContent).toBe('5'));
  });

  it('is 0 for an empty cart', async () => {
    renderCart();
    await waitFor(() => expect(cartApi.getCart).toHaveBeenCalled());
    expect(screen.getByTestId('subtotal').textContent).toBe('0');
  });
});

describe('CartProvider taxAmount/total/taxLabel', () => {
  it('reads tax amount, total, and tax label directly from the API response — no client-side recomputation', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [cartItem({ quantity: 2, unitPrice: '10.00' })],
      subtotal: '20.00', taxAmount: '4.00', total: '24.00', taxLabel: 'VAT',
    });

    renderCart();

    await waitFor(() => expect(screen.getByTestId('subtotal').textContent).toBe('20'));
    expect(screen.getByTestId('tax').textContent).toBe('4');
    expect(screen.getByTestId('total').textContent).toBe('24');
    expect(screen.getByTestId('tax-label').textContent).toBe('VAT');
  });

  it('falls back to the generic "Tax" label when the API reports mixed tax types', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [cartItem()],
      subtotal: '2.50', taxAmount: '0.50', total: '3.00', taxLabel: 'Tax',
    });

    renderCart();

    await waitFor(() => expect(screen.getByTestId('tax-label').textContent).toBe('Tax'));
  });

  it('updates tax/total from the fresh response after a quantity change resolves', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [cartItem({ quantity: 1, unitPrice: '10.00' })],
      subtotal: '10.00', taxAmount: '2.00', total: '12.00', taxLabel: 'VAT',
    });
    (cartApi.upsertItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [cartItem({ quantity: 2, unitPrice: '10.00' })],
      subtotal: '20.00', taxAmount: '4.00', total: '24.00', taxLabel: 'VAT',
    });

    renderCart();
    await waitFor(() => expect(screen.getByTestId('tax').textContent).toBe('2'));

    fireEvent.click(screen.getByText('increase'));

    await waitFor(() => expect(screen.getByTestId('tax').textContent).toBe('4'));
    expect(screen.getByTestId('total').textContent).toBe('24');
  });
});

describe('CartProvider item order', () => {
  const unordered = {
    orderId: 'order-1',
    items: [
      cartItem({ productId: 'p-shiraz', product: { id: 'p-shiraz', name: 'Shiraz', sku: null } }),
      cartItem({ productId: 'p-chardonnay', product: { id: 'p-chardonnay', name: 'Chardonnay', sku: null } }),
      cartItem({ productId: 'p-merlot', product: { id: 'p-merlot', name: 'Merlot', sku: null } }),
    ],
    subtotal: '7.50', taxAmount: '1.50', total: '9.00', taxLabel: 'VAT',
  };

  it('sorts items alphabetically by product name when the API returns them out of order', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue(unordered);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('order').textContent).toBe('Chardonnay,Merlot,Shiraz'));
  });

  it('keeps the order stable after a quantity change resolves', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue(unordered);
    (cartApi.upsertItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...unordered,
      items: [
        unordered.items[2],
        { ...unordered.items[0], quantity: 5 },
        unordered.items[1],
      ],
    });

    renderCart();
    await waitFor(() => expect(screen.getByTestId('order').textContent).toBe('Chardonnay,Merlot,Shiraz'));

    fireEvent.click(screen.getByText('increase'));

    await waitFor(() => expect(cartApi.upsertItem).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('order').textContent).toBe('Chardonnay,Merlot,Shiraz'));
  });
});

describe('CartProvider syncItem', () => {
  it('persists the adjusted quantity via cartApi.upsertItem for a product not yet in the cart', async () => {
    renderCart();
    await waitFor(() => expect(cartApi.getCart).toHaveBeenCalled());

    fireEvent.click(screen.getByText('increase'));

    await waitFor(() => {
      expect(cartApi.upsertItem).toHaveBeenCalledWith(
        { distributorSlug: 'test-dist', productId: 'prod-1', quantity: 1 },
      );
    });
  });

  it('persists the adjusted quantity via cartApi.upsertItem for a product already in the cart', async () => {
    (cartApi.getCart as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: 'order-1',
      items: [cartItem({ quantity: 3, unitPrice: '1.00' })],
      subtotal: '3.00', taxAmount: '0.60', total: '3.60', taxLabel: 'VAT',
    });

    renderCart();
    await waitFor(() => expect(screen.getByTestId('in-cart').textContent).toBe('yes'));

    fireEvent.click(screen.getByText('increase'));

    await waitFor(() => {
      expect(cartApi.upsertItem).toHaveBeenCalledWith(
        { distributorSlug: 'test-dist', productId: 'prod-1', quantity: 4 },
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
      );
    });
  });
});
