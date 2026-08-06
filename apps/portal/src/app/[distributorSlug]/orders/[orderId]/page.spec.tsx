import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OrderDetailPage from './page';
import { OrderAcceptanceMode, AcceptanceModeSource, OrderStatus, OrderLineStatus, type Order, type OrderLine } from '@wholo/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ distributorSlug: 'winos', orderId: 'order-1' }),
  usePathname: () => '/winos/orders/order-1',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ user: { id: 'u1', organisationId: 'org-1' }, accessToken: 'tok', isLoading: false }),
}));

const mockGetOrder = vi.fn();
vi.mock('@wholo/api-client', () => ({
  ordersApi: {
    getOrder: (...args: unknown[]) => mockGetOrder(...args),
    cancelOrder: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    problem: { status: number; detail?: string };
    constructor(problem: { status: number; detail?: string }) {
      super(problem.detail ?? '');
      this.problem = problem;
    }
  },
}));

function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 'line-1',
    orderId: 'order-1',
    distributorId: 'dist-1',
    traderCustomerId: 'cust-1',
    productId: 'prod-1',
    productVariantId: null,
    productThumbnailUrl: null,
    skuSnapshot: 'SKU-1',
    productNameSnapshot: 'Wine',
    unitOfMeasureSnapshot: null,
    quantityOrdered: 2,
    unitPriceSnapshot: '12.23',
    subtotalAmount: '24.46',
    taxAmount: '0.00',
    totalAmount: '24.46',
    taxTypeId: null,
    taxTypeNameSnapshot: null,
    taxClassificationSnapshot: null,
    taxRatePercentageSnapshot: null,
    status: OrderLineStatus.ACCEPTED,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNumber: 'ORD-2026-00001',
    distributorId: 'dist-1',
    traderCustomerId: 'cust-1',
    placedByUserId: 'u1',
    status: OrderStatus.ACCEPTED,
    currency: 'GBP',
    subtotalAmount: '24.46',
    taxAmount: '0.00',
    taxLabel: 'VAT',
    totalAmount: '24.46',
    billingAddressSnapshot: null,
    deliveryAddressSnapshot: null,
    requestedDeliveryDate: null,
    customerReference: null,
    notes: null,
    acceptanceModeSnapshot: OrderAcceptanceMode.MANUAL,
    acceptanceModeSourceSnapshot: AcceptanceModeSource.DISTRIBUTOR_DEFAULT,
    submittedAt: '2026-07-01T10:00:00.000Z',
    acceptedAt: '2026-07-01T11:00:00.000Z',
    acceptedByActorType: null,
    acceptedByUserId: null,
    rejectedAt: null,
    rejectedByUserId: null,
    rejectionReason: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    lines: [makeLine()],
    traderCustomer: { id: 'cust-1', name: 'Test Org' },
    invoiceSummary: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders full-width (not the narrow commerce shell)', async () => {
    mockGetOrder.mockResolvedValue(makeOrder());
    const { container } = render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-2026-00001').length).toBeGreaterThan(0));
    const shell = container.querySelector('.flex.w-full.flex-1.flex-col');
    expect(shell?.className).not.toContain('max-w-[480px]');
  });

  it('shows the agreed delivery date', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ requestedDeliveryDate: '2026-07-14' }));
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Delivery')).toBeTruthy());
    expect(screen.getByText('14 Jul 2026')).toBeTruthy();
  });

  it('shows the delivery section when only a date is set (no address)', async () => {
    mockGetOrder.mockResolvedValue(
      makeOrder({ requestedDeliveryDate: '2026-07-14', deliveryAddressSnapshot: null }),
    );
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Delivery')).toBeTruthy());
  });

  it('omits the delivery section when there is no date and no address', async () => {
    mockGetOrder.mockResolvedValue(
      makeOrder({ requestedDeliveryDate: null, deliveryAddressSnapshot: null }),
    );
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getAllByText('ORD-2026-00001').length).toBeGreaterThan(0));
    expect(screen.queryByText('Delivery')).toBeNull();
  });

  it('renders a product thumbnail when one is available', async () => {
    mockGetOrder.mockResolvedValue(
      makeOrder({ lines: [makeLine({ productThumbnailUrl: 'https://cdn.test/thumb.webp' })] }),
    );
    const { container } = render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Wine')).toBeTruthy());
    const img = container.querySelector('img[src="https://cdn.test/thumb.webp"]');
    expect(img).toBeTruthy();
  });

  it('renders the gradient placeholder when there is no product thumbnail', async () => {
    mockGetOrder.mockResolvedValue(
      makeOrder({ lines: [makeLine({ productThumbnailUrl: null })] }),
    );
    const { container } = render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Wine')).toBeTruthy());
    expect(container.querySelector('.od-img-placeholder')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('labels the tax row with the real tax type name from the API response', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ taxLabel: 'VAT', taxAmount: '4.89' }));
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('VAT')).toBeTruthy());
    expect(screen.queryByText('GST')).toBeNull();
    expect(screen.queryByText('Tax (GST)')).toBeNull();
  });

  it('falls back to the generic "Tax" label when the API reports mixed tax types', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ taxLabel: 'Tax' }));
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText('Tax')).toBeTruthy());
  });
});
