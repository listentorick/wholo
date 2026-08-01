import type { CustomerSelfView, MyDeliveryAddressResponse, MyProfileResponse, PortalDistributorSummary } from '@wholo/types';
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

  getDistributorRelationship(
    distributorSlug: string,
    customerId: string,
    token: string,
  ): Promise<CustomerSelfView | null> {
    const params = new URLSearchParams({ customerId });
    return apiFetch<CustomerSelfView | null>(
      `/api/v1/portal/me/distributors/${distributorSlug}/relationship?${params}`,
      { token },
    );
  },

  requestDistributorAccess(
    distributorSlug: string,
    customerId: string,
    recentContact: boolean,
    token: string,
  ): Promise<CustomerSelfView> {
    const params = new URLSearchParams({ customerId });
    return apiFetch<CustomerSelfView>(
      `/api/v1/portal/me/distributors/${distributorSlug}/relationship?${params}`,
      { method: 'POST', body: JSON.stringify({ recentContact }), token },
    );
  },
};
