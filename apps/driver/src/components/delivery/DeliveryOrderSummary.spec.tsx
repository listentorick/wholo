import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryOrderSummary } from './DeliveryOrderSummary';
import { DeliveryLinkOrder } from '@/types/delivery';

const order: DeliveryLinkOrder = {
  orderNumber: '10428',
  distributorName: 'Blackbird Wines',
  customerName: 'The Old Hall',
  address: { line1: '8 High Street', line2: null, city: 'Halifax', state: null, postcode: 'HX1 2AB', country: 'GB' },
  customerPhone: '07700 900123',
  deliveryInstructions: 'Use the rear entrance',
  lines: [{ productName: 'Rioja Crianza', quantity: 3 }],
  state: 'PENDING',
};

describe('DeliveryOrderSummary', () => {
  it('shows the order number, customer, address, phone, instructions and products', () => {
    render(<DeliveryOrderSummary order={order} />);

    expect(screen.getByText('Order 10428')).toBeInTheDocument();
    expect(screen.getByText('The Old Hall')).toBeInTheDocument();
    expect(screen.getByText(/8 High Street/)).toBeInTheDocument();
    expect(screen.getByText('07700 900123')).toBeInTheDocument();
    expect(screen.getByText('Use the rear entrance')).toBeInTheDocument();
    expect(screen.getByText('Rioja Crianza')).toBeInTheDocument();
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('never shows pricing', () => {
    render(<DeliveryOrderSummary order={order} />);
    expect(screen.queryByText(/£|\$/)).not.toBeInTheDocument();
  });

  it('omits the instructions callout entirely when there are none', () => {
    render(<DeliveryOrderSummary order={{ ...order, deliveryInstructions: null }} />);
    expect(screen.queryByText('Delivery instructions')).not.toBeInTheDocument();
  });
});
