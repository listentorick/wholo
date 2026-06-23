import type { PortalDistributorSummary } from '@wholo/types';
import { apiFetch } from './base';

export const portalApi = {
  getMyDistributors(token: string): Promise<PortalDistributorSummary[]> {
    return apiFetch<PortalDistributorSummary[]>('/api/v1/portal/me/distributors', { token });
  },
};
