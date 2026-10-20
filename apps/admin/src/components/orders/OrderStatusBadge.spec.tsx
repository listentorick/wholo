import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderStatus } from '@wholo/types';
import { OrderStatusBadge } from './OrderStatusBadge';

describe('OrderStatusBadge', () => {
  it('shows a submitted order as pending', () => {
    render(<OrderStatusBadge status={OrderStatus.SUBMITTED} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('labels every other status in words', () => {
    render(<OrderStatusBadge status={OrderStatus.DELIVERY_FAILED} />);
    expect(screen.getByText('Delivery failed')).toBeInTheDocument();
  });
});
