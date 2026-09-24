import type { CustomerHealthResponse } from '@wholo/types';
import { apiFetch } from './base';

export const adminCustomerHealthApi = {
  /** Health tiers, flagged reasons and buying trends for the Customers dashboard (needs analytics:read). */
  get(signal?: AbortSignal): Promise<CustomerHealthResponse> {
    return apiFetch<CustomerHealthResponse>('/api/v1/customer-health', { signal });
  },
};
