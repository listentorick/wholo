import { render, screen, waitFor } from '@testing-library/react';
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
    const mobileCard = container.querySelector('.md\\:hidden');
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
});
