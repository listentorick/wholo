import { describe, it, expect } from 'vitest';
import { accountingProviderLabel, integrationTermLabel, paymentTermLabel } from './payment-term-labels';

describe('payment term labels', () => {
  it('names the integration', () => {
    expect(accountingProviderLabel('XERO')).toBe('Xero');
    expect(integrationTermLabel('XERO')).toBe('Xero manages due date');
  });

  it('falls back to the raw provider code for one it has no label for', () => {
    expect(integrationTermLabel('SAGE')).toBe('SAGE manages due date');
  });

  it('labels the built-in term after the integration, and other terms by name', () => {
    expect(paymentTermLabel({ name: 'Set by accounting software', type: 'ACCOUNTING_SYSTEM_DEFAULT' }, 'XERO')).toBe('Xero manages due date');
    expect(paymentTermLabel({ name: 'Net 30', type: 'DAYS_AFTER_INVOICE' }, 'XERO')).toBe('Net 30');
    expect(paymentTermLabel({ name: 'Set by accounting software', type: 'ACCOUNTING_SYSTEM_DEFAULT' }, null)).toBe('Set by accounting software');
  });
});
