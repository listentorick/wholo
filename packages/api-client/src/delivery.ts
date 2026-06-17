import type { DeliveryAvailabilityResponse } from '@wholo/types';
import { apiFetch } from './base';

export const deliveryApi = {
  getAvailableDates(distributorSlug: string, token: string): Promise<DeliveryAvailabilityResponse> {
    return apiFetch<DeliveryAvailabilityResponse>(
      `/api/v1/delivery/available-dates?distributorSlug=${encodeURIComponent(distributorSlug)}`,
      { token },
    );
  },
};
