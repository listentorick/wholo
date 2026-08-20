import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DeliveryCard as DeliveryCardType } from '@wholo/types';
import { UnassignedColumn } from './UnassignedColumn';

const NOOP = {
  allRuns: [], pendingOrderId: null, onMove: vi.fn(), onChangeDate: vi.fn(),
};

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
    requestedDeliveryDate: '2026-08-20',
    allocationSource: null,
    ...overrides,
  };
}

describe('UnassignedColumn', () => {
  it('renders the Unassigned heading', () => {
    render(<UnassignedColumn cards={[]} {...NOOP} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows an empty-state message with no cards', () => {
    render(<UnassignedColumn cards={[]} {...NOOP} />);
    expect(screen.getByText(/everything/i)).toBeInTheDocument();
  });

  it('renders every unassigned card and sums their item totals', () => {
    render(<UnassignedColumn cards={[makeCard({ orderId: 'a', itemCount: 5 }), makeCard({ orderId: 'b', itemCount: 7 })]} {...NOOP} />);
    expect(screen.getByText('2 stops · 12 items')).toBeInTheDocument();
  });
});
