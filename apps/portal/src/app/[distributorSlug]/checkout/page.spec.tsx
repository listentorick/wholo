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
  useRequireAuth: () => ({ user: { id: 'u1', organisationId: 'org-1' }, accessToken: 'tok', isLoading: false }),
}));

const mockClearOrderAsSession = vi.fn();
let mockOrderAsMode = false;
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    orderAsMode: mockOrderAsMode,
    orderAsCustomerId: null,
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
const mockGetMyDeliveryAddress = vi.fn().mockResolvedValue({ deliveryAddress: null });
vi.mock('@wholo/api-client', () => ({
  ordersApi: { submitOrder: (...args: unknown[]) => mockSubmitOrder(...args) },
  deliveryApi: { getAvailableDates: vi.fn().mockResolvedValue({ dates: [] }) },
  portalApi: { getMyDeliveryAddress: (...args: unknown[]) => mockGetMyDeliveryAddress(...args) },
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

describe('CheckoutPage — delivery address', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderAsMode = false;
  });

  it('shows the delivery address when one is on file', async () => {
    mockGetMyDeliveryAddress.mockResolvedValue({
      deliveryAddress: {
        line1: '1 Wine Lane', line2: null, city: 'Melbourne',
        state: 'VIC', postcode: '3000', country: 'Australia',
      },
    });

    render(<CheckoutPage />);

    expect(await screen.findByText('Delivery Address')).toBeInTheDocument();
    expect(screen.getByText('1 Wine Lane, Melbourne, VIC, 3000, Australia')).toBeInTheDocument();
  });

  it('shows the empty state when no address is on file', async () => {
    mockGetMyDeliveryAddress.mockResolvedValue({ deliveryAddress: null });

    render(<CheckoutPage />);

    expect(
      await screen.findByText('No delivery address on file. Please contact your distributor to add one.'),
    ).toBeInTheDocument();
  });

  it('shows the empty state when the address lookup fails', async () => {
    mockGetMyDeliveryAddress.mockRejectedValue(new Error('403'));

    render(<CheckoutPage />);

    expect(
      await screen.findByText('No delivery address on file. Please contact your distributor to add one.'),
    ).toBeInTheDocument();
  });
});
