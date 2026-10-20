import type { CustomerOrderingBehaviour } from '@wholo/types';
import { apiFetch } from './base';

export const adminCustomerOrderingApi = {
  /** A customer's recency, order frequency, spend and product breadth over the last 30 days (needs analytics:read). */
  get(customerId: string, signal?: AbortSignal): Promise<CustomerOrderingBehaviour> {
    return apiFetch<CustomerOrderingBehaviour>(`/api/v1/customers/${encodeURIComponent(customerId)}/ordering-behaviour`, { signal });
  },
};
