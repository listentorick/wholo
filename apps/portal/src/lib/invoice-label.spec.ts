import { describe, it, expect } from 'vitest';
import type { OrderInvoicePayment } from '@wholo/types';
import { invoiceLabel } from './invoice-label';

const payment = (over: Partial<OrderInvoicePayment> = {}): OrderInvoicePayment => ({
  paymentStatus: 'UNPAID',
  isOverdue: false,
  externalInvoiceNumber: 'INV-1',
  total: 120,
  amountPaid: 0,
  amountDue: 120,
  dueDate: '2026-10-12',
  fullyPaidOn: null,
  ...over,
});
const completed = (p: OrderInvoicePayment | null) => ({ status: 'COMPLETED' as const, externalInvoiceStatus: 'AUTHORISED', payment: p });

describe('invoiceLabel', () => {
  it('shows the due date while an invoice is unpaid and not yet due', () => {
    expect(invoiceLabel(completed(payment()), 'GBP').text).toBe('Due 12 Oct');
  });

  it('shows how much is still due on a part-paid invoice', () => {
    expect(invoiceLabel(completed(payment({ paymentStatus: 'PART_PAID', amountPaid: 20, amountDue: 100 })), 'GBP').text).toMatch(
      /^Part paid · .*100\.00 due$/,
    );
  });

  it('says Overdue once the due date has passed', () => {
    const label = invoiceLabel(completed(payment({ isOverdue: true })), 'GBP');
    expect(label.text).toMatch(/^Overdue · .*120\.00 due$/);
    expect(label.tone).toBe('bad');
  });

  it('says Paid when paid', () => {
    expect(invoiceLabel(completed(payment({ paymentStatus: 'PAID', amountDue: 0 })), 'GBP')).toEqual({ text: 'Paid', tone: 'good' });
  });

  it('falls back to the export state before the invoice has been synced', () => {
    expect(invoiceLabel(completed(null), 'GBP').text).toBe('Raised (AUTHORISED)');
    expect(invoiceLabel(null, 'GBP').text).toBe('Not yet raised');
    expect(invoiceLabel({ status: 'PROCESSING', externalInvoiceStatus: null }, 'GBP').text).toBe('Raising invoice…');
  });
});
