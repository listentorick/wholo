import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrderSummary } from '@wholo/types';
import { OrderStatus } from '@wholo/types';
import OrdersPage from './page';

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ isLoading: false }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockListOrders = vi.fn();
const mockAcceptOrder = vi.fn();
const mockRejectOrder = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminOrdersApi: {
      listOrders: (...args: unknown[]) => mockListOrders(...args),
      acceptOrder: (...args: unknown[]) => mockAcceptOrder(...args),
      rejectOrder: (...args: unknown[]) => mockRejectOrder(...args),
    },
  };
});

function makeOrder(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'order-1',
    orderNumber: 'ORD-1001',
    status: OrderStatus.ACCEPTED,
    totalAmount: '123.45',
    traderCustomerName: 'Blackbird Kitchen',
    submittedAt: '2026-08-20T00:00:00.000Z',
    acceptedAt: '2026-08-21T00:00:00.000Z',
    rejectedAt: null,
    cancelledAt: null,
    createdAt: '2026-08-19T00:00:00.000Z',
    requestedDeliveryDate: '2026-08-24',
    invoiceSummary: null,
    ...overrides,
  };
}

// Desktop table and mobile card list both render in JSDOM at once (Tailwind
// breakpoint classes are just CSS, no real viewport to evaluate against) —
// same dual-surface convention as MobileCardList's other consumers. Scope
// queries to whichever surface is under test.
describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListOrders.mockResolvedValue({
      data: [makeOrder()],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
  });

  describe('desktop table', () => {
    it('renders order number, customer, total and delivery date', async () => {
      render(<OrdersPage />);
      const table = within(await screen.findByRole('table'));

      expect(table.getByText('ORD-1001')).toBeInTheDocument();
      expect(table.getByText('Blackbird Kitchen')).toBeInTheDocument();
      expect(table.getByText('£123.45')).toBeInTheDocument();
      expect(table.getByText('24 Aug 2026')).toBeInTheDocument();
    });
  });

  describe('mobile card list', () => {
    it('shows order number, customer, status and total/delivery date collapsed', async () => {
      render(<OrdersPage />);
      const list = within(await screen.findByRole('list'));

      expect(list.getByText('ORD-1001')).toBeInTheDocument();
      expect(list.getByText('Blackbird Kitchen')).toBeInTheDocument();
      expect(list.getByText('Accepted')).toBeInTheDocument();
      expect(list.getByText(/£123\.45 · Due 24 Aug 2026/)).toBeInTheDocument();

      const toggle = list.getByRole('button', { name: /ORD-1001/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('reveals the submitted date and a View link when expanded for an accepted order', async () => {
      render(<OrdersPage />);
      const list = within(await screen.findByRole('list'));

      await userEvent.click(list.getByRole('button', { name: /ORD-1001/ }));

      expect(list.getByText('20 Aug 2026')).toBeInTheDocument();
      expect(list.getByRole('link', { name: /View order/ })).toHaveAttribute('href', '/orders/order-1');
      expect(list.queryByText('Accept')).not.toBeInTheDocument();
    });

    it('shows Accept/Reject for a submitted order and accepts it', async () => {
      mockListOrders.mockResolvedValue({
        data: [makeOrder({ status: OrderStatus.SUBMITTED, acceptedAt: null })],
        pagination: { nextCursor: null, hasMore: false, total: 1 },
      });
      mockAcceptOrder.mockResolvedValue({ status: OrderStatus.ACCEPTED, acceptedAt: '2026-08-22T00:00:00.000Z' });

      render(<OrdersPage />);
      const list = within(await screen.findByRole('list'));

      await userEvent.click(list.getByRole('button', { name: /ORD-1001/ }));
      await userEvent.click(list.getByRole('button', { name: 'Accept' }));

      expect(mockAcceptOrder).toHaveBeenCalledWith('order-1', 'test-token', { confirmUnmappedTaxTypes: false });
    });
  });
});
