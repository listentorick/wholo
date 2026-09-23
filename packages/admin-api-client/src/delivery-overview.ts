import type { DeliveryOutcomesResponse, DeliveryOverview } from '@wholo/types';
import { apiFetch } from './base';

export const adminDeliveryOverviewApi = {
  /** Live snapshot for the Delivery dashboard (needs orders:read + delivery:read). */
  get(signal?: AbortSignal): Promise<DeliveryOverview> {
    return apiFetch<DeliveryOverview>('/api/v1/delivery-overview', { signal });
  },

  /** Per-day delivery outcomes for a date range (YYYY-MM-DD, inclusive), from delivery facts. */
  outcomes(from: string, to: string, signal?: AbortSignal): Promise<DeliveryOutcomesResponse> {
    const qs = new URLSearchParams({ from, to });
    return apiFetch<DeliveryOutcomesResponse>(`/api/v1/delivery-outcomes?${qs.toString()}`, { signal });
  },
};
