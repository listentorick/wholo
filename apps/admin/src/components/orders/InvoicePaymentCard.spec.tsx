import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoicePaymentCard } from './InvoicePaymentCard';

describe('InvoicePaymentCard', () => {
  it('shows the invoice, what has been paid and what is still due', () => {
    render(
      <InvoicePaymentCard
        currency="GBP"
        payment={{
          paymentStatus: 'PART_PAID',
          isOverdue: false,
          externalInvoiceNumber: 'INV-0042',
          total: 120,
          amountPaid: 20,
          amountDue: 100,
          dueDate: '2026-10-15',
          fullyPaidOn: null,
        }}
      />,
    );

    expect(screen.getByText('INV-0042')).toBeInTheDocument();
    expect(screen.getByText('Part paid', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Still due').nextSibling).toHaveTextContent('100.00');
    expect(screen.getByText('15 Oct 2026')).toBeInTheDocument();
    expect(screen.queryByText('Paid in full on')).not.toBeInTheDocument();
  });

  it('says when the invoice was paid in full', () => {
    render(
      <InvoicePaymentCard
        currency="GBP"
        payment={{
          paymentStatus: 'PAID',
          isOverdue: false,
          externalInvoiceNumber: 'INV-0042',
          total: 120,
          amountPaid: 120,
          amountDue: 0,
          dueDate: '2026-10-15',
          fullyPaidOn: '2026-10-02',
        }}
      />,
    );

    expect(screen.getByText('Paid', { selector: 'span' })).toBeInTheDocument(); // the badge, not the 'Paid' amount label
    expect(screen.getByText('Paid in full on').nextSibling).toHaveTextContent('2 Oct 2026');
  });
});
