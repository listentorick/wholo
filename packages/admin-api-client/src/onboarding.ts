import type { CreateDistributorRequest, DistributorOrganisation } from '@wholo/types';
import { apiFetch } from './base';

export const adminOnboardingApi = {
  createDistributor(token: string, req: CreateDistributorRequest): Promise<DistributorOrganisation> {
    return apiFetch<DistributorOrganisation>('/api/v1/onboarding/distributor', {
      method: 'POST',
      token,
      body: JSON.stringify(req),
    });
  },
};
