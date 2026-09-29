import type { CustomerPaymentSummary } from '@wholo/types';
import { apiFetch } from './base';

export const adminCustomerPaymentsApi = {
  /** A customer's outstanding / overdue invoices and how promptly they pay (needs customers:read). */
  get(customerId: string, signal?: AbortSignal): Promise<CustomerPaymentSummary> {
    return apiFetch<CustomerPaymentSummary>(`/api/v1/customers/${encodeURIComponent(customerId)}/payments`, { signal });
  },
};
