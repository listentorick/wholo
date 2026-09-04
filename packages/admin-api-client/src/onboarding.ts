import type { CreateDistributorRequest, DistributorOrganisation } from '@wholo/types';
import { apiFetch } from './base';

export const adminOnboardingApi = {
  createDistributor(req: CreateDistributorRequest): Promise<DistributorOrganisation> {
    return apiFetch<DistributorOrganisation>('/api/v1/onboarding/distributor', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
};
