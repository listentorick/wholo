import type { MyProfileResponse, PortalDistributorSummary } from '@wholo/types';
import { apiFetch } from './base';

export const portalApi = {
  getMyDistributors(token: string): Promise<PortalDistributorSummary[]> {
    return apiFetch<PortalDistributorSummary[]>('/api/v1/portal/me/distributors', { token });
  },

  getMyProfile(token: string): Promise<MyProfileResponse> {
    return apiFetch<MyProfileResponse>('/api/v1/portal/me/profile', { token });
  },

  updateMyProfile(token: string, body: Partial<MyProfileResponse>): Promise<MyProfileResponse> {
    return apiFetch<MyProfileResponse>('/api/v1/portal/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
      token,
    });
  },
};
