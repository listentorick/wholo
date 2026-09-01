import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import OrdersPage from './page';
import { OrderStatus, type OrderSummary } from '@wholo/types';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: vi.fn(),
}));

vi.mock('@wholo/api-client', () => ({
  ordersApi: {
    listOrders: vi.fn(),
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { ordersApi } from '@wholo/api-client';

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

function makeOrder(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'order-1',
    orderNumber: 'ORD-2026-00001',
    status: OrderStatus.ACCEPTED,
    currency: 'GBP',
    totalAmount: '42.50',
    traderCustomerName: 'Test Org',
    submittedAt: '2026-07-01T10:00:00.000Z',
    acceptedAt: '2026-07-01T11:00:00.000Z',
    rejectedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    requestedDeliveryDate: null,
    invoiceSummary: null,
    ...overrides,
  };
}

function makeResponse(orders: OrderSummary[]) {
  return {
    data: orders,
    pagination: { nextCursor: null, hasMore: false, total: orders.length },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ distributorSlug: 'test-dist' });
  (useRequireAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: mockUser,
    accessToken: 'test-token',
    isLoading: false,
    orderAsMode: false,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrdersPage', () => {
  it('renders the order list full-width (not the narrow commerce shell)', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder()]));
    const { container } = render(<OrdersPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-2026-00001').length).toBeGreaterThan(0));
    const shell = container.querySelector('.flex.w-full.flex-1.flex-col');
    expect(shell?.className).not.toContain('max-w-[480px]');
  });

  it('shows the delivery date on both the desktop table and the mobile card', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(
      makeResponse([makeOrder({ requestedDeliveryDate: '2026-07-14' })]),
    );
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getAllByText('14 Jul 2026').length).toBe(2));
  });

  it('shows an em dash in the desktop table when no delivery date is set', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder({ requestedDeliveryDate: null })]));
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('—')).toBeTruthy());
  });

  it('omits the delivery date line on the mobile card when there is no delivery date', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder({ requestedDeliveryDate: null })]));
    const { container } = render(<OrdersPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-2026-00001').length).toBeGreaterThan(0));
    const mobileCard = container.querySelector('.xl\\:hidden');
    expect(mobileCard).not.toBeNull();
    expect(mobileCard?.textContent).not.toContain('—');
  });

  it('renders all six table columns with their headers', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder()]));
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('Order')).toBeTruthy());
    expect(screen.getByText('Order Date')).toBeTruthy();
    expect(screen.getByText('Delivery Date')).toBeTruthy();
    expect(screen.getByText('Invoice')).toBeTruthy();
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
  });

  it('shows "Not yet raised" when no invoice export exists', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder({ invoiceSummary: null })]));
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('Not yet raised')).toBeTruthy());
  });

  it('shows the raised status with the provider status appended', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(
      makeResponse([makeOrder({ invoiceSummary: { status: 'COMPLETED', externalInvoiceStatus: 'AUTHORISED' } })]),
    );
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('Raised (AUTHORISED)')).toBeTruthy());
  });

  it('shows "Export failed" when the invoice export failed', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(
      makeResponse([makeOrder({ invoiceSummary: { status: 'FAILED', externalInvoiceStatus: null } })]),
    );
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('Export failed')).toBeTruthy());
  });

  it('renders the customer-facing status label via the badge', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder({ status: OrderStatus.COMPLETED })]));
    render(<OrdersPage />);
    // one badge in the desktop table, one in the mobile card ("Completed" is not a chip label)
    await waitFor(() => expect(screen.getAllByText('Completed').length).toBe(2));
  });

  it('renders the per-status filter chips', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder()]));
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toBeTruthy());
    for (const label of ['Awaiting confirmation', 'Delivered', 'Cancelled']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // "Accepted" is both a chip and (potentially) a badge — assert the chip exists
    expect(screen.getByRole('button', { name: 'Accepted' })).toBeTruthy();
  });

  it('shows the "Showing N of total" count from the pagination total', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue({
      data: [makeOrder()],
      pagination: { nextCursor: null, hasMore: false, total: 7 },
    });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText('Showing 1 of 7')).toBeTruthy());
  });

  it('refetches from the first page with the exact status when a chip is clicked', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue(makeResponse([makeOrder()]));
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delivered' })).toBeTruthy());

    vi.mocked(ordersApi.listOrders).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }));

    await waitFor(() => expect(ordersApi.listOrders).toHaveBeenCalledTimes(1));
    const params = vi.mocked(ordersApi.listOrders).mock.calls[0][0];
    expect(params.status).toBe(OrderStatus.DELIVERED);
    expect(params.cursor).toBeUndefined();
  });

  it('shows a filter-specific empty state that clears back to the unfiltered list', async () => {
    vi.mocked(ordersApi.listOrders).mockImplementation((params) =>
      Promise.resolve(makeResponse(params.status ? [] : [makeOrder()])),
    );
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-2026-00001').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));
    await waitFor(() => expect(screen.getByText('No orders match this filter')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    await waitFor(() => expect(screen.getAllByText('ORD-2026-00001').length).toBeGreaterThan(0));
  });
});
