import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckoutPage from './page';

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ distributorSlug: 'winos' }),
  usePathname: () => '/winos/checkout',
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ user: { id: 'u1' }, accessToken: 'tok', isLoading: false }),
}));

const mockClearOrderAsSession = vi.fn();
let mockOrderAsMode = false;
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    orderAsMode: mockOrderAsMode,
    clearOrderAsSession: mockClearOrderAsSession,
  }),
  ApiError: class extends Error {},
}));

const mockRefreshCart = vi.fn();
vi.mock('@/lib/cart-context', () => ({
  useCart: () => ({
    cartLoading: false,
    items: [{ productId: 'p1', quantity: 1, unitPrice: '10.00', product: { id: 'p1', name: 'Wine' } }],
    quantities: { p1: 1 },
    savingItems: new Set(),
    syncItem: vi.fn(),
    refreshCart: mockRefreshCart,
  }),
}));

const mockSubmitOrder = vi.fn();
vi.mock('@wholo/api-client', () => ({
  ordersApi: { submitOrder: (...args: unknown[]) => mockSubmitOrder(...args) },
  deliveryApi: { getAvailableDates: vi.fn().mockResolvedValue({ dates: [] }) },
  ApiError: class ApiError extends Error {
    problem: { status: number; detail?: string };
    status: number;
    constructor(problem: { status: number; detail?: string }, status: number) {
      super(problem.detail ?? '');
      this.problem = problem;
      this.status = status;
    }
  },
}));

vi.mock('@/components/PageSubHeader', () => ({ PageSubHeader: () => null }));

describe('CheckoutPage — handlePlaceOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshCart.mockResolvedValue(undefined);
  });

  it('calls clearOrderAsSession (not refreshCart) when order-as mode is active', async () => {
    mockOrderAsMode = true;
    mockSubmitOrder.mockResolvedValue({ id: 'ord-1' });

    render(<CheckoutPage />);
    fireEvent.click(screen.getByText('Place Order'));

    await waitFor(() => expect(mockSubmitOrder).toHaveBeenCalled());
    expect(mockClearOrderAsSession).toHaveBeenCalled();
    expect(mockRefreshCart).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('calls refreshCart and router.push when not in order-as mode', async () => {
    mockOrderAsMode = false;
    mockSubmitOrder.mockResolvedValue({ id: 'ord-1' });

    render(<CheckoutPage />);
    fireEvent.click(screen.getByText('Place Order'));

    await waitFor(() => expect(mockRefreshCart).toHaveBeenCalled());
    expect(mockClearOrderAsSession).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/winos/orders/ord-1');
  });
});
