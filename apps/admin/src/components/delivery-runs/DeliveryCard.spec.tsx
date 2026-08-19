import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DeliveryCard as DeliveryCardType } from '@wholo/types';
import { DeliveryCard } from './DeliveryCard';

function makeCard(overrides: Partial<DeliveryCardType> = {}): DeliveryCardType {
  return {
    orderId: 'order-1',
    orderNumber: 'ORD-1001',
    traderCustomerId: 'cust-1',
    customerName: 'Blackbird Kitchen',
    deliveryAddress: null,
    stopNumber: 1,
    lineCount: 4,
    itemCount: 22,
    attention: 'NONE',
    unallocatedReason: null,
    suggestedRunId: null,
    suggestedRouteName: null,
    scheduledDeliveryDate: '2026-08-20',
    allocationSource: 'DEFAULT_ROUTE',
    ...overrides,
  };
}

describe('DeliveryCard', () => {
  it('renders the customer name, order number, and stop number', () => {
    render(<DeliveryCard card={makeCard({ stopNumber: 3 })} />);
    expect(screen.getByText('Blackbird Kitchen')).toBeInTheDocument();
    expect(screen.getByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows lines/items, never "cases"', () => {
    render(<DeliveryCard card={makeCard()} />);
    expect(screen.getByText('4 lines · 22 items')).toBeInTheDocument();
  });

  it('shows an Unassigned badge and the reason line when attention is UNASSIGNED', () => {
    render(<DeliveryCard card={makeCard({
      attention: 'UNASSIGNED', unallocatedReason: 'NO_ROUTE', stopNumber: null,
    })}
    />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('No delivery route')).toBeInTheDocument();
  });

  it('renders no stop-number badge when unassigned', () => {
    render(<DeliveryCard card={makeCard({ attention: 'UNASSIGNED', stopNumber: null })} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
