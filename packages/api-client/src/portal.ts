import type { MyDeliveryAddressResponse, MyProfileResponse, PortalDistributorSummary } from '@wholo/types';
import { apiFetch } from './base';

export const portalApi = {
  getMyDistributors(token: string): Promise<PortalDistributorSummary[]> {
    return apiFetch<PortalDistributorSummary[]>('/api/v1/portal/me/distributors', { token });
  },

  getMyProfile(token: string): Promise<MyProfileResponse> {
    return apiFetch<MyProfileResponse>('/api/v1/portal/me/profile', { token });
  },

  getMyDeliveryAddress(
    distributorSlug: string,
    customerId: string,
    token: string,
  ): Promise<MyDeliveryAddressResponse> {
    const params = new URLSearchParams({ distributorSlug, customerId });
    return apiFetch<MyDeliveryAddressResponse>(`/api/v1/portal/me/delivery-address?${params}`, { token });
  },

  updateMyProfile(token: string, body: Partial<MyProfileResponse>): Promise<MyProfileResponse> {
    return apiFetch<MyProfileResponse>('/api/v1/portal/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
      token,
    });
  },
};
