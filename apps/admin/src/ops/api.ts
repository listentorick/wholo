import { apiFetch } from '@wholo/admin-api-client';
import type { PlatformDistributor, PlatformStats, SupportGrant } from '@wholo/types';

// The Ops app's own BFF endpoints (apps/admin-api src/ops, ADR-078). Kept here,
// not in @wholo/admin-api-client, so nothing in the admin build can call them.
export const opsApi = {
  stats(): Promise<PlatformStats> {
    return apiFetch<PlatformStats>('/api/v1/ops/stats');
  },

  distributors(query: { q?: string; filter?: 'attention' | 'mine' } = {}): Promise<PlatformDistributor[]> {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.filter) params.set('filter', query.filter);
    const qs = params.toString();
    return apiFetch<PlatformDistributor[]>(`/api/v1/ops/distributors${qs ? `?${qs}` : ''}`);
  },

  myGrants(): Promise<SupportGrant[]> {
    return apiFetch<SupportGrant[]>('/api/v1/ops/grants');
  },

  openAccess(distributorId: string, reason: string, durationMinutes: number): Promise<SupportGrant> {
    return apiFetch<SupportGrant>('/api/v1/ops/grants', { method: 'POST', body: JSON.stringify({ distributorId, reason, durationMinutes }) });
  },

  endAccess(distributorId: string, grantId: string): Promise<SupportGrant> {
    return apiFetch<SupportGrant>(`/api/v1/ops/grants/${encodeURIComponent(distributorId)}/${encodeURIComponent(grantId)}`, { method: 'DELETE' });
  },
};
