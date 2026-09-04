import type {
  DeliveryProfile,
  DeliveryProfileSummary,
  DeliveryProfileCutoffRule,
  PaginatedResponse,
  DeliveryProfileListParams,
  CreateDeliveryProfileRequest,
  UpdateDeliveryProfileRequest,
  CreateDeliveryProfileCutoffRuleRequest,
  UpdateDeliveryProfileCutoffRuleRequest,
  AssignDeliveryProfileRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminDeliveryProfilesApi = {
  list(params?: DeliveryProfileListParams): Promise<PaginatedResponse<DeliveryProfileSummary>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return apiFetch<PaginatedResponse<DeliveryProfileSummary>>(
      `/api/v1/delivery-profiles${qs ? `?${qs}` : ''}`,
    );
  },

  get(id: string): Promise<DeliveryProfile> {
    return apiFetch<DeliveryProfile>(`/api/v1/delivery-profiles/${id}`);
  },

  create(req: CreateDeliveryProfileRequest): Promise<DeliveryProfile> {
    return apiFetch<DeliveryProfile>('/api/v1/delivery-profiles', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update(id: string, req: UpdateDeliveryProfileRequest): Promise<DeliveryProfile> {
    return apiFetch<DeliveryProfile>(`/api/v1/delivery-profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/delivery-profiles/${id}`, { method: 'DELETE' });
  },

  listCutoffRules(profileId: string): Promise<DeliveryProfileCutoffRule[]> {
    return apiFetch<DeliveryProfileCutoffRule[]>(`/api/v1/delivery-profiles/${profileId}/cutoff-rules`);
  },

  createCutoffRule(
    profileId: string,
    req: CreateDeliveryProfileCutoffRuleRequest,
  ): Promise<DeliveryProfileCutoffRule> {
    return apiFetch<DeliveryProfileCutoffRule>(`/api/v1/delivery-profiles/${profileId}/cutoff-rules`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  updateCutoffRule(
    profileId: string,
    ruleId: string,
    req: UpdateDeliveryProfileCutoffRuleRequest,
  ): Promise<DeliveryProfileCutoffRule> {
    return apiFetch<DeliveryProfileCutoffRule>(`/api/v1/delivery-profiles/${profileId}/cutoff-rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  deleteCutoffRule(profileId: string, ruleId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/delivery-profiles/${profileId}/cutoff-rules/${ruleId}`, {
      method: 'DELETE',
    });
  },

  assignToCustomer(customerId: string, req: AssignDeliveryProfileRequest): Promise<void> {
    return apiFetch<void>(`/api/v1/customers/${customerId}/delivery-profile`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },
};
