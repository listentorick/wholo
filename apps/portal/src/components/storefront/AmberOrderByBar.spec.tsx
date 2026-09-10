import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return { ...actual, useDistributor: () => ({ distributor: { currencyCode: 'GBP' } }) };
});

import { AmberOrderByBar } from './AmberOrderByBar';

const deliveryParts = { time: '2:00pm', cutoffDayLabel: 'tomorrow', dayName: 'Friday', dayOrdinal: '11th' };

describe('AmberOrderByBar', () => {
  it('renders the delivery cut-off line from deliveryParts', () => {
    const { container } = render(
      <AmberOrderByBar deliveryParts={deliveryParts} subtotal={0} effectiveMinSpend={null} />,
    );
    expect(container.textContent).toContain('Order by');
    expect(container.textContent).toContain('2:00pm');
    expect(container.textContent).toContain('Friday 11th');
  });

  it('shows the minimum-order progress line while below the minimum', () => {
    render(<AmberOrderByBar deliveryParts={null} subtotal={30} effectiveMinSpend={150} />);
    expect(screen.getByText(/Add/)).toHaveTextContent('Add £120.00 more to reach the £150.00 minimum');
  });

  it('renders nothing when there is no delivery line and the minimum is met or unset', () => {
    const { container: met } = render(
      <AmberOrderByBar deliveryParts={null} subtotal={200} effectiveMinSpend={150} />,
    );
    expect(met.firstChild).toBeNull();

    const { container: none } = render(
      <AmberOrderByBar deliveryParts={null} subtotal={0} effectiveMinSpend={null} />,
    );
    expect(none.firstChild).toBeNull();
  });
});
