import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class DeliveryProfilesService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: Record<string, string>, token: string) {
    const qs = new URLSearchParams(query).toString();
    const suffix = qs ? `?${qs}` : '';
    return this.api.get(`/admin/distributors/${distributorId}/delivery-profiles${suffix}`, token);
  }

  findOne(distributorId: string, id: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/delivery-profiles/${id}`, token);
  }

  create(distributorId: string, body: unknown, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/delivery-profiles`, token, body);
  }

  update(distributorId: string, id: string, body: unknown, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/delivery-profiles/${id}`, token, body);
  }

  remove(distributorId: string, id: string, token: string) {
    return this.api.delete(`/admin/distributors/${distributorId}/delivery-profiles/${id}`, token);
  }

  listCutoffRules(distributorId: string, id: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/delivery-profiles/${id}/cutoff-rules`, token);
  }

  createCutoffRule(distributorId: string, id: string, body: unknown, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/delivery-profiles/${id}/cutoff-rules`, token, body);
  }

  updateCutoffRule(distributorId: string, id: string, ruleId: string, body: unknown, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/delivery-profiles/${id}/cutoff-rules/${ruleId}`, token, body);
  }

  removeCutoffRule(distributorId: string, id: string, ruleId: string, token: string) {
    return this.api.delete(`/admin/distributors/${distributorId}/delivery-profiles/${id}/cutoff-rules/${ruleId}`, token);
  }
}
