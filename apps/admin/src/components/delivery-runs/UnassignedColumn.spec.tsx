import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DeliveryCard as DeliveryCardType } from '@wholo/types';
import { UnassignedColumn } from './UnassignedColumn';

function makeCard(overrides: Partial<DeliveryCardType> = {}): DeliveryCardType {
  return {
    orderId: 'order-1',
    orderNumber: 'ORD-1001',
    traderCustomerId: 'cust-1',
    customerName: 'Blackbird Kitchen',
    deliveryAddress: null,
    stopNumber: null,
    lineCount: 2,
    itemCount: 10,
    attention: 'UNASSIGNED',
    unallocatedReason: 'NO_ROUTE',
    suggestedRunId: null,
    suggestedRouteName: null,
    scheduledDeliveryDate: '2026-08-20',
    allocationSource: null,
    ...overrides,
  };
}

describe('UnassignedColumn', () => {
  it('renders the Unassigned heading', () => {
    render(<UnassignedColumn cards={[]} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows an empty-state message with no cards', () => {
    render(<UnassignedColumn cards={[]} />);
    expect(screen.getByText(/everything/i)).toBeInTheDocument();
  });

  it('renders every unassigned card and sums their item totals', () => {
    render(<UnassignedColumn cards={[makeCard({ orderId: 'a', itemCount: 5 }), makeCard({ orderId: 'b', itemCount: 7 })]} />);
    expect(screen.getByText('2 stops · 12 items')).toBeInTheDocument();
  });
});
