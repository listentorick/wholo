import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeliveryParts } from '@/lib/hooks/use-delivery-parts';

let mockDistributor: {
  distributor: { currencyCode: string } | null;
  deliveryParts: DeliveryParts | null;
  effectiveMinSpend: number | null;
};
let mockSubtotal: number;

vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return { ...actual, useDistributor: () => mockDistributor };
});
vi.mock('@/lib/cart-context', () => ({ useCartSafe: () => ({ subtotal: mockSubtotal }) }));

import { AmberOrderByBar } from './AmberOrderByBar';

const deliveryParts: DeliveryParts = {
  time: '2:00pm',
  cutoffDayLabel: 'tomorrow',
  dayName: 'Friday',
  dayOrdinal: '11th',
};

beforeEach(() => {
  mockDistributor = { distributor: { currencyCode: 'GBP' }, deliveryParts: null, effectiveMinSpend: null };
  mockSubtotal = 0;
});

describe('AmberOrderByBar', () => {
  it('renders the delivery cut-off line from context', () => {
    mockDistributor.deliveryParts = deliveryParts;
    const { container } = render(<AmberOrderByBar />);
    expect(container.textContent).toContain('Order by');
    expect(container.textContent).toContain('2:00pm');
    expect(container.textContent).toContain('Friday 11th');
  });

  it('shows the minimum-order progress line while below the minimum', () => {
    mockDistributor.effectiveMinSpend = 150;
    mockSubtotal = 30;
    render(<AmberOrderByBar />);
    expect(screen.getByText(/Add/)).toHaveTextContent('Add £120.00 more to reach the £150.00 minimum');
  });

  it('renders nothing when there is no delivery line and the minimum is met or unset', () => {
    mockDistributor.effectiveMinSpend = 150;
    mockSubtotal = 200;
    const { container: met } = render(<AmberOrderByBar />);
    expect(met.firstChild).toBeNull();

    mockDistributor.effectiveMinSpend = null;
    mockSubtotal = 0;
    const { container: none } = render(<AmberOrderByBar />);
    expect(none.firstChild).toBeNull();
  });
});
