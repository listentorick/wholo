import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OrderInvoicePayment } from '@wholo/types';
import { PaymentBadge } from './PaymentBadge';

const payment = (over: Partial<OrderInvoicePayment> = {}): OrderInvoicePayment => ({
  paymentStatus: 'UNPAID',
  isOverdue: false,
  externalInvoiceNumber: 'INV-1',
  total: 120,
  amountPaid: 0,
  amountDue: 120,
  dueDate: '2026-10-01',
  fullyPaidOn: null,
  ...over,
});

describe('PaymentBadge', () => {
  it.each([
    [payment(), 'Unpaid'],
    [payment({ paymentStatus: 'PART_PAID', amountPaid: 20, amountDue: 100 }), 'Part paid'],
    [payment({ paymentStatus: 'PAID', amountPaid: 120, amountDue: 0 }), 'Paid'],
    [payment({ paymentStatus: 'VOID' }), 'Void'],
    [payment({ paymentStatus: 'PART_PAID', isOverdue: true }), 'Overdue'],
  ])('labels the invoice in words', (p, label) => {
    render(<PaymentBadge payment={p} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows nothing until the invoice has been synced', () => {
    const { container } = render(<PaymentBadge payment={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
