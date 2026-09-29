import { AccountingInvoiceState } from '@prisma/client';
import { derivePaymentStatus, isOverdue } from './invoice-payment-status';

const awaiting = (over: Record<string, unknown> = {}) => ({
  invoiceState: AccountingInvoiceState.AWAITING_PAYMENT,
  invoiceTotal: '120.00',
  amountPaid: '0',
  amountCredited: '0',
  amountDue: '120.00',
  dueDate: new Date('2026-10-15'),
  ...over,
});

describe('derivePaymentStatus', () => {
  it('is NOT_SYNCED until the status sync has seen the invoice', () => {
    expect(derivePaymentStatus({ invoiceState: null })).toBe('NOT_SYNCED');
  });

  it('is UNPAID while nothing has been paid or credited', () => {
    expect(derivePaymentStatus(awaiting())).toBe('UNPAID');
  });

  it('treats an invoice still in draft or awaiting approval as UNPAID', () => {
    expect(derivePaymentStatus(awaiting({ invoiceState: AccountingInvoiceState.DRAFT }))).toBe('UNPAID');
    expect(derivePaymentStatus(awaiting({ invoiceState: AccountingInvoiceState.AWAITING_APPROVAL }))).toBe('UNPAID');
  });

  it('is PART_PAID when something is paid and something is still due', () => {
    expect(derivePaymentStatus(awaiting({ amountPaid: '50', amountDue: '70' }))).toBe('PART_PAID');
  });

  it('counts a credit note towards settlement', () => {
    expect(derivePaymentStatus(awaiting({ amountCredited: '20', amountDue: '100' }))).toBe('PART_PAID');
  });

  it('is PAID when the provider says so, or nothing is left due', () => {
    expect(derivePaymentStatus(awaiting({ invoiceState: AccountingInvoiceState.PAID, amountDue: '0' }))).toBe('PAID');
    expect(derivePaymentStatus(awaiting({ amountPaid: '100', amountCredited: '20', amountDue: '0' }))).toBe('PAID');
  });

  it('does not call a zero-value invoice PAID just because nothing is due', () => {
    expect(derivePaymentStatus(awaiting({ invoiceTotal: '0', amountDue: '0' }))).toBe('UNPAID');
  });

  it('is VOID when voided or deleted, even after a part payment', () => {
    expect(derivePaymentStatus(awaiting({ invoiceState: AccountingInvoiceState.VOIDED, amountPaid: '50' }))).toBe('VOID');
    expect(derivePaymentStatus(awaiting({ invoiceState: AccountingInvoiceState.DELETED }))).toBe('VOID');
  });

  it('accepts Prisma Decimal-like values', () => {
    const decimal = (v: string) => ({ toString: () => v });
    expect(derivePaymentStatus(awaiting({ amountPaid: decimal('10'), amountDue: decimal('110') }))).toBe('PART_PAID');
  });
});

describe('isOverdue', () => {
  it('is not overdue on the due date itself', () => {
    expect(isOverdue(awaiting(), '2026-10-15')).toBe(false);
  });

  it('is overdue the day after, while money is still due', () => {
    expect(isOverdue(awaiting(), '2026-10-16')).toBe(true);
    expect(isOverdue(awaiting({ amountPaid: '50', amountDue: '70' }), '2026-10-16')).toBe(true);
  });

  it('is never overdue once paid, voided, or still a draft', () => {
    expect(isOverdue(awaiting({ amountDue: '0' }), '2027-01-01')).toBe(false);
    expect(isOverdue(awaiting({ invoiceState: AccountingInvoiceState.PAID }), '2027-01-01')).toBe(false);
    expect(isOverdue(awaiting({ invoiceState: AccountingInvoiceState.VOIDED }), '2027-01-01')).toBe(false);
    expect(isOverdue(awaiting({ invoiceState: AccountingInvoiceState.DRAFT }), '2027-01-01')).toBe(false);
  });

  it('is not overdue without a due date', () => {
    expect(isOverdue(awaiting({ dueDate: null }), '2027-01-01')).toBe(false);
  });
});
