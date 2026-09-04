import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouteCustomerAssignmentPanel } from './RouteCustomerAssignmentPanel';
import type { DeliveryRouteCustomer } from '@wholo/types';

const { reorderCustomers, removeCustomer, listCustomers } = vi.hoisted(() => ({
  reorderCustomers: vi.fn(),
  removeCustomer: vi.fn().mockResolvedValue(undefined),
  listCustomers: vi.fn().mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } }),
}));

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return {
    ...actual,
    adminDeliveryRoutesApi: {
      reorderCustomers,
      removeCustomer,
    },
    adminCustomersApi: { list: listCustomers },
  };
});

function makeCustomer(overrides: Partial<DeliveryRouteCustomer> = {}): DeliveryRouteCustomer {
  return {
    id: `rc-${overrides.customerId ?? '1'}`,
    routeId: 'route-1',
    customerId: 'cust-1',
    customerName: 'Blackbird Kitchen',
    deliveryAddress: { addressLine1: '23 The Calls', addressCity: 'Leeds', addressPostcode: 'LS1 1AA' },
    defaultDropPosition: 1,
    assignedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RouteCustomerAssignmentPanel', () => {
  it('renders customers in drop order', () => {
    const customers = [
      makeCustomer({ id: 'rc-1', customerId: 'cust-1', customerName: 'Blackbird Kitchen', defaultDropPosition: 1 }),
      makeCustomer({ id: 'rc-2', customerId: 'cust-2', customerName: 'The Old Mill Cafe', defaultDropPosition: 2 }),
    ];
    render(
      <RouteCustomerAssignmentPanel routeId="route-1" customers={customers} onCustomersChange={vi.fn()} />,
    );

    expect(screen.getByText('Blackbird Kitchen')).toBeInTheDocument();
    expect(screen.getByText('The Old Mill Cafe')).toBeInTheDocument();
  });

  it('shows an empty state when no customers are assigned', () => {
    render(
      <RouteCustomerAssignmentPanel routeId="route-1" customers={[]} onCustomersChange={vi.fn()} />,
    );
    expect(screen.getByText('No customers assigned yet.')).toBeInTheDocument();
  });

  it('disables Move up on the first row and Move down on the last row', () => {
    const customers = [
      makeCustomer({ id: 'rc-1', customerId: 'cust-1', defaultDropPosition: 1 }),
      makeCustomer({ id: 'rc-2', customerId: 'cust-2', customerName: 'Second', defaultDropPosition: 2 }),
    ];
    render(
      <RouteCustomerAssignmentPanel routeId="route-1" customers={customers} onCustomersChange={vi.fn()} />,
    );

    const moveUpButtons = screen.getAllByRole('button', { name: 'Move up' });
    const moveDownButtons = screen.getAllByRole('button', { name: 'Move down' });
    expect(moveUpButtons[0]).toBeDisabled();
    expect(moveDownButtons[1]).toBeDisabled();
    expect(moveDownButtons[0]).not.toBeDisabled();
    expect(moveUpButtons[1]).not.toBeDisabled();
  });

  it('moving the second row up persists the swapped order via the non-drag control', async () => {
    const customers = [
      makeCustomer({ id: 'rc-1', customerId: 'cust-1', customerName: 'First', defaultDropPosition: 1 }),
      makeCustomer({ id: 'rc-2', customerId: 'cust-2', customerName: 'Second', defaultDropPosition: 2 }),
    ];
    const onCustomersChange = vi.fn();
    reorderCustomers.mockResolvedValue([
      makeCustomer({ id: 'rc-2', customerId: 'cust-2', customerName: 'Second', defaultDropPosition: 1 }),
      makeCustomer({ id: 'rc-1', customerId: 'cust-1', customerName: 'First', defaultDropPosition: 2 }),
    ]);

    render(
      <RouteCustomerAssignmentPanel routeId="route-1" customers={customers} onCustomersChange={onCustomersChange} />,
    );

    const moveUpButtons = screen.getAllByRole('button', { name: 'Move up' });
    fireEvent.click(moveUpButtons[1]);

    await waitFor(() => {
      expect(reorderCustomers).toHaveBeenCalledWith('route-1', {
        orderedCustomerIds: ['cust-2', 'cust-1'],
      });
    });
    await waitFor(() => {
      expect(onCustomersChange).toHaveBeenLastCalledWith(
        expect.arrayContaining([expect.objectContaining({ customerId: 'cust-2', defaultDropPosition: 1 })]),
      );
    });
  });

  it('reverts to the previous order when persisting a reorder fails', async () => {
    const customers = [
      makeCustomer({ id: 'rc-1', customerId: 'cust-1', defaultDropPosition: 1 }),
      makeCustomer({ id: 'rc-2', customerId: 'cust-2', customerName: 'Second', defaultDropPosition: 2 }),
    ];
    const onCustomersChange = vi.fn();
    reorderCustomers.mockRejectedValue(new Error('network error'));

    render(
      <RouteCustomerAssignmentPanel routeId="route-1" customers={customers} onCustomersChange={onCustomersChange} />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]);

    await waitFor(() => {
      expect(screen.getByText(/failed to save the new order/i)).toBeInTheDocument();
    });
    expect(onCustomersChange).toHaveBeenLastCalledWith(customers);
  });

  it('removes a customer', async () => {
    const customers = [makeCustomer({ id: 'rc-1', customerId: 'cust-1', defaultDropPosition: 1 })];
    const onCustomersChange = vi.fn();

    render(
      <RouteCustomerAssignmentPanel routeId="route-1" customers={customers} onCustomersChange={onCustomersChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(removeCustomer).toHaveBeenCalledWith('route-1', 'cust-1');
    });
    expect(onCustomersChange).toHaveBeenCalledWith([]);
  });

  it('opens the add-customer drawer', async () => {
    render(
      <RouteCustomerAssignmentPanel routeId="route-1" customers={[]} onCustomersChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add customers/i }));

    expect(screen.getByText('Add customers to this route')).toBeInTheDocument();
    await waitFor(() => expect(listCustomers).toHaveBeenCalled());
  });
});
