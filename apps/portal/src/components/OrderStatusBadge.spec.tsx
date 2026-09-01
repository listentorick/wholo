import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderStatus } from '@wholo/types';

describe('OrderStatusBadge', () => {
  it.each([
    [OrderStatus.SUBMITTED, 'Awaiting confirmation', '#fef3ec'],
    [OrderStatus.ACCEPTED, 'Accepted', '#dcfce7'],
    [OrderStatus.DELIVERED, 'Delivered', '#dcfce7'],
    [OrderStatus.COMPLETED, 'Completed', '#dbeafe'],
    [OrderStatus.CANCELLED, 'Cancelled', '#f3f4f6'],
    [OrderStatus.REJECTED, 'Rejected', '#fee2e2'],
    [OrderStatus.DELIVERY_FAILED, 'Delivery failed', '#fee2e2'],
  ])('renders %s as "%s" with the matching tone', (status, label, bg) => {
    render(<OrderStatusBadge status={status} />);
    const el = screen.getByText(label);
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ backgroundColor: bg });
  });

  it('falls back to the raw value and the gray tone for an unknown status', () => {
    render(<OrderStatusBadge status="WAT" />);
    const el = screen.getByText('WAT');
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ backgroundColor: '#f3f4f6' });
  });
});
