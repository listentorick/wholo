import type { CustomerSelfView, MyDeliveryAddressResponse, MyProfileResponse, PortalDistributorSummary } from '@wholo/types';
import { apiFetch } from './base';

export const portalApi = {
  getMyDistributors(): Promise<PortalDistributorSummary[]> {
    return apiFetch<PortalDistributorSummary[]>('/api/v1/portal/me/distributors');
  },

  getMyProfile(): Promise<MyProfileResponse> {
    return apiFetch<MyProfileResponse>('/api/v1/portal/me/profile');
  },

  getMyDeliveryAddress(
    distributorSlug: string,
    customerId: string,
  ): Promise<MyDeliveryAddressResponse> {
    const params = new URLSearchParams({ distributorSlug, customerId });
    return apiFetch<MyDeliveryAddressResponse>(`/api/v1/portal/me/delivery-address?${params}`);
  },

  updateMyProfile(body: Partial<MyProfileResponse>): Promise<MyProfileResponse> {
    return apiFetch<MyProfileResponse>('/api/v1/portal/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  getDistributorRelationship(
    distributorSlug: string,
    customerId: string,
  ): Promise<CustomerSelfView | null> {
    const params = new URLSearchParams({ customerId });
    return apiFetch<CustomerSelfView | null>(
      `/api/v1/portal/me/distributors/${distributorSlug}/relationship?${params}`,
    );
  },

  requestDistributorAccess(
    distributorSlug: string,
    customerId: string,
    recentContact: boolean,
  ): Promise<CustomerSelfView> {
    const params = new URLSearchParams({ customerId });
    return apiFetch<CustomerSelfView>(
      `/api/v1/portal/me/distributors/${distributorSlug}/relationship?${params}`,
      { method: 'POST', body: JSON.stringify({ recentContact }) },
    );
  },
};
