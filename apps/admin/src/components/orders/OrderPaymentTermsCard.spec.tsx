import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OrderPaymentTerms } from '@wholo/types';
import { OrderPaymentTermsCard } from './OrderPaymentTermsCard';

const NET_30 = { id: 'pt-1', name: 'Net 30', type: 'DAYS_AFTER_INVOICE' as const, summary: '30 days after the invoice date' };
const INTEGRATION = { id: 'pt-sys', name: 'Set by accounting software', type: 'ACCOUNTING_SYSTEM_DEFAULT' as const, summary: 'Due date set by the accounting software' };
const accepted = (overrides: Partial<OrderPaymentTerms> = {}): OrderPaymentTerms => ({
  calculated: true,
  invoiceDate: '2026-10-04',
  dueDate: '2026-11-03',
  term: NET_30,
  source: 'TRADER_CUSTOMER_OVERRIDE',
  accountingProvider: 'XERO',
  ...overrides,
});

describe('OrderPaymentTermsCard', () => {
  it('shows the calculated due date, invoice date and the terms that produced it', () => {
    render(<OrderPaymentTermsCard paymentTerms={accepted()} />);
    expect(screen.getByText('3 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('4 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/Net 30/)).toBeInTheDocument();
    expect(screen.getByText(/customer’s terms/)).toBeInTheDocument();
    expect(screen.getByText('30 days after the invoice date')).toBeInTheDocument();
  });

  it('always shows the integration\'s date once it reports one, with ours for reference when they differ', () => {
    render(<OrderPaymentTermsCard paymentTerms={accepted()} syncedDueDate="2026-11-10" />);
    expect(screen.getByText('10 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Changed in Xero (calculated 3 Nov 2026)')).toBeInTheDocument();
  });

  it('says nothing changed when the synced date matches', () => {
    render(<OrderPaymentTermsCard paymentTerms={accepted()} syncedDueDate="2026-11-03" />);
    expect(screen.queryByText(/Changed in/)).not.toBeInTheDocument();
  });

  it('says the integration manages the due date until its date is synced back', () => {
    const deferred = accepted({ dueDate: null, term: INTEGRATION, source: 'DISTRIBUTOR_DEFAULT' });
    const { rerender } = render(<OrderPaymentTermsCard paymentTerms={deferred} />);
    expect(screen.getAllByText(/Xero manages due date/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Set by accounting software')).not.toBeInTheDocument();

    rerender(<OrderPaymentTermsCard paymentTerms={deferred} syncedDueDate="2026-10-18" />);
    expect(screen.getByText('18 Oct 2026')).toBeInTheDocument();
  });

  it('says no payment terms are set when nothing is chosen and there is no integration', () => {
    render(
      <OrderPaymentTermsCard
        paymentTerms={accepted({ dueDate: null, term: { ...INTEGRATION, id: null }, source: 'DISTRIBUTOR_DEFAULT', accountingProvider: null })}
      />,
    );
    expect(screen.getByText('No payment terms set')).toBeInTheDocument();
    expect(screen.queryByText(/manages due date/)).not.toBeInTheDocument();
  });

  it('shows the terms that would apply to an order not yet accepted, with no dates', () => {
    render(
      <OrderPaymentTermsCard
        paymentTerms={accepted({ calculated: false, invoiceDate: null, dueDate: null, source: 'DISTRIBUTOR_DEFAULT' })}
      />,
    );
    expect(screen.getByText('Set when the order is accepted')).toBeInTheDocument();
    expect(screen.getByText('Terms if accepted now')).toBeInTheDocument();
    expect(screen.getByText(/your default/)).toBeInTheDocument();
    expect(screen.queryByText('Invoice date')).not.toBeInTheDocument();
  });
});
