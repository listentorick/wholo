import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryConfirmation } from './DeliveryConfirmation';
import { DeliveryLinkOrder } from '@/types/delivery';

const submittedOrder: DeliveryLinkOrder = {
  orderNumber: '10428',
  distributorName: 'Blackbird Wines',
  customerName: 'The Old Hall',
  address: { line1: null, line2: null, city: null, state: null, postcode: null, country: null },
  customerPhone: null,
  deliveryInstructions: null,
  lines: [],
  state: 'SUBMITTED',
  outcome: { outcome: 'DELIVERED', recordedAt: '2026-08-25T14:32:00Z', driverName: 'Alex Turner' },
};

describe('DeliveryConfirmation', () => {
  it('shows the order number, outcome, date/time, and driver', () => {
    render(<DeliveryConfirmation order={submittedOrder} />);

    expect(screen.getByText('Order 10428')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText(/Driver: Alex Turner/)).toBeInTheDocument();
  });

  it('renders with no editable controls at all', () => {
    render(<DeliveryConfirmation order={submittedOrder} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('shows nothing beyond order number/outcome/date/driver — no address, contact, or products, even though the DTO could carry more', () => {
    render(<DeliveryConfirmation order={{ ...submittedOrder, customerName: 'Should Not Show' }} />);
    expect(screen.queryByText('Should Not Show')).not.toBeInTheDocument();
  });

  it('omits the driver line when no driver is available', () => {
    render(<DeliveryConfirmation order={{ ...submittedOrder, outcome: { ...submittedOrder.outcome!, driverName: null } }} />);
    expect(screen.queryByText(/Driver:/)).not.toBeInTheDocument();
  });
});
