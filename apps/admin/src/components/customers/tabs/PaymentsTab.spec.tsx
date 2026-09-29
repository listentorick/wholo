import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Customer, CustomerPaymentSummary } from '@wholo/types';
import { PaymentsTab } from './PaymentsTab';

const get = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({ adminCustomerPaymentsApi: { get: (...args: unknown[]) => get(...args) } }));

const customer = { organisationId: 'cust-org-1' } as Customer;

const summary: CustomerPaymentSummary = {
  customerId: 'cust-org-1',
  asOf: '2026-09-29',
  outstanding: { amount: 220, count: 2 },
  overdue: { amount: 100, count: 1, oldestDaysOverdue: 12 },
  last90Days: { paidCount: 4, averageDaysToPay: 27.5, paidOnTimePercent: 75 },
  openInvoices: [
    {
      orderId: 'o-1', orderNumber: 'ORD-1', externalInvoiceNumber: 'INV-1', currency: 'GBP', total: 100, amountDue: 100,
      dueDate: '2026-09-17', paymentStatus: 'UNPAID', isOverdue: true, daysOverdue: 12,
    },
  ],
};

describe('PaymentsTab', () => {
  beforeEach(() => get.mockReset());

  it("loads this customer's payments and shows what they owe and how they pay", async () => {
    get.mockResolvedValue(summary);
    render(<PaymentsTab customer={customer} />);

    expect(await screen.findByText('1 invoice, oldest 12 days late')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('cust-org-1', expect.anything());
    expect(screen.getByText('27.5')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('INV-1')).toBeInTheDocument();
    expect(screen.getByText('Overdue', { selector: 'span' })).toBeInTheDocument(); // the invoice's badge
  });

  it('never shows a misleading 0 when nothing has been paid yet', async () => {
    get.mockResolvedValue({ ...summary, last90Days: { paidCount: 0, averageDaysToPay: null, paidOnTimePercent: null }, openInvoices: [] });
    render(<PaymentsTab customer={customer} />);

    expect(await screen.findByText('No unpaid invoices.')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
