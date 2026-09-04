import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { apiFetch } from './base';

export const adminSettingsApi = {
  get(): Promise<DistributorSettings> {
    return apiFetch<DistributorSettings>('/api/v1/settings');
  },

  update(req: UpdateDistributorSettingsRequest): Promise<DistributorSettings> {
    return apiFetch<DistributorSettings>('/api/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },
};
