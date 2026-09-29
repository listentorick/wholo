import { paymentFilterWhere, toOrderInvoicePayment } from './order-invoice-payment';

describe('toOrderInvoicePayment', () => {
  const row = {
    status: 'COMPLETED' as const,
    externalInvoiceNumber: 'INV-9',
    invoiceState: 'AWAITING_PAYMENT' as const,
    invoiceTotal: '120.00',
    amountPaid: '0',
    amountCredited: '0',
    amountDue: '120.00',
    dueDate: new Date('2026-09-30T00:00:00Z'),
    fullyPaidOn: null,
  };

  it('is null until the export completed and the status sync has seen the invoice', () => {
    expect(toOrderInvoicePayment(undefined, '2026-10-01')).toBeNull();
    expect(toOrderInvoicePayment({ ...row, status: 'FAILED' }, '2026-10-01')).toBeNull();
    expect(toOrderInvoicePayment({ ...row, invoiceState: null }, '2026-10-01')).toBeNull();
  });

  it('describes an unpaid invoice that became overdue', () => {
    expect(toOrderInvoicePayment(row, '2026-10-01')).toEqual({
      paymentStatus: 'UNPAID',
      isOverdue: true,
      externalInvoiceNumber: 'INV-9',
      total: 120,
      amountPaid: 0,
      amountDue: 120,
      dueDate: '2026-09-30',
      fullyPaidOn: null,
    });
  });
});

describe('paymentFilterWhere', () => {
  it('filters overdue on the distributor-local date, strictly before today', () => {
    const where = paymentFilterWhere('OVERDUE', '2026-10-01');
    expect(where.invoiceExports).toEqual({
      some: expect.objectContaining({
        status: 'COMPLETED',
        invoiceState: 'AWAITING_PAYMENT',
        amountDue: { gt: 0 },
        dueDate: { lt: new Date('2026-10-01T00:00:00.000Z') },
      }),
    });
  });

  it('treats a provider-PAID invoice as paid', () => {
    const where = paymentFilterWhere('PAID', '2026-10-01') as { invoiceExports: { some: { OR: unknown[] } } };
    expect(where.invoiceExports.some.OR).toContainEqual({ invoiceState: 'PAID' });
  });
});
