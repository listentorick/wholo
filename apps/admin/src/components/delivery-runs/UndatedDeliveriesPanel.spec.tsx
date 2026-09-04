import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderStatus, type OrderSummary } from '@wholo/types';
import { UndatedDeliveriesPanel } from './UndatedDeliveriesPanel';

const mockListOrders = vi.fn();
const mockChangeScheduledDeliveryDate = vi.fn();
const mockGetReschedulePreview = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminOrdersApi: {
      listOrders: (...args: unknown[]) => mockListOrders(...args),
    },
    adminDeliveryRunsApi: {
      ...actual.adminDeliveryRunsApi,
      changeScheduledDeliveryDate: (...args: unknown[]) => mockChangeScheduledDeliveryDate(...args),
      getReschedulePreview: (...args: unknown[]) => mockGetReschedulePreview(...args),
    },
  };
});

function makeOrder(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'order-1',
    orderNumber: 'ORD-1001',
    status: OrderStatus.ACCEPTED,
    currency: 'GBP',
    totalAmount: '100.00',
    traderCustomerName: 'Blackbird Kitchen',
    submittedAt: '2026-08-19T10:00:00.000Z',
    acceptedAt: '2026-08-19T10:05:00.000Z',
    rejectedAt: null,
    cancelledAt: null,
    createdAt: '2026-08-19T10:00:00.000Z',
    requestedDeliveryDate: null,
    ...overrides,
  };
}

describe('UndatedDeliveriesPanel', () => {
  beforeEach(() => {
    mockListOrders.mockReset();
    mockChangeScheduledDeliveryDate.mockReset();
    mockGetReschedulePreview.mockReset();
    mockGetReschedulePreview.mockResolvedValue({
      resolution: { allocated: false, reason: 'NO_ROUTE' },
      nearbyDeliveries: [],
    });
  });

  it('queries ACCEPTED + undated orders', async () => {
    mockListOrders.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } });

    render(<UndatedDeliveriesPanel />);

    await waitFor(() => expect(mockListOrders).toHaveBeenCalled());
    const [params] = mockListOrders.mock.calls[0];
    expect(params).toEqual({ status: 'ACCEPTED', undated: true, limit: 10 });
  });

  it('renders nothing when there are no undated deliveries', async () => {
    mockListOrders.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } });

    const { container } = render(<UndatedDeliveriesPanel />);

    await waitFor(() => expect(mockListOrders).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the undated orders with a count and links to each order', async () => {
    mockListOrders.mockResolvedValue({
      data: [makeOrder({ id: 'order-1', orderNumber: 'ORD-1001' })],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });

    render(<UndatedDeliveriesPanel />);

    expect(await screen.findByText('1 accepted delivery has no delivery date')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'ORD-1001' });
    expect(link).toHaveAttribute('href', '/orders/order-1');
    expect(screen.getByText('Blackbird Kitchen')).toBeInTheDocument();
  });

  it('notes when more exist than the shown page', async () => {
    mockListOrders.mockResolvedValue({
      data: [makeOrder()],
      pagination: { nextCursor: 'cursor-1', hasMore: true, total: 25 },
    });

    render(<UndatedDeliveriesPanel />);

    expect(await screen.findByText('25 accepted deliveries have no delivery date (showing 1)')).toBeInTheDocument();
  });

  it('shows an inline error message instead of throwing when listOrders rejects', async () => {
    mockListOrders.mockRejectedValue(new Error('boom'));

    render(<UndatedDeliveriesPanel />);

    await waitFor(() => expect(screen.getByText('Could not check for undated deliveries.')).toBeInTheDocument());
  });

  it('opens ChangeDeliveryDateDialog when "Set delivery date" is clicked', async () => {
    mockListOrders.mockResolvedValue({
      data: [makeOrder({ id: 'order-1', orderNumber: 'ORD-1001' })],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });

    render(<UndatedDeliveriesPanel />);
    await userEvent.click(await screen.findByText('Set delivery date'));

    expect(screen.getByText('Change delivery date')).toBeInTheDocument();
    expect(screen.getByText('Blackbird Kitchen · ORD-1001')).toBeInTheDocument();
  });

  it('sets the delivery date and reloads the list on confirm', async () => {
    mockListOrders.mockResolvedValue({
      data: [makeOrder({ id: 'order-1', orderNumber: 'ORD-1001' })],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
    mockChangeScheduledDeliveryDate.mockResolvedValue({});

    render(<UndatedDeliveriesPanel />);
    await userEvent.click(await screen.findByText('Set delivery date'));

    const input = screen.getByLabelText('New delivery date');
    await userEvent.type(input, '2026-08-25');
    await waitFor(() => expect(screen.getByText('Save date')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Save date'));

    await waitFor(() => expect(mockChangeScheduledDeliveryDate).toHaveBeenCalledWith('order-1', { scheduledDeliveryDate: '2026-08-25', expectedScheduledDeliveryDate: null },
    ));
    expect(mockListOrders).toHaveBeenCalledTimes(2); // initial load + reload after confirm
  });
});
