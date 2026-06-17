import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class DeliveryProfilesService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: Record<string, string>) {
    const qs = new URLSearchParams(query).toString();
    const suffix = qs ? `?${qs}` : '';
    return this.api.get(`/admin/delivery-profiles${suffix}`, distributorId);
  }

  findOne(distributorId: string, id: string) {
    return this.api.get(`/admin/delivery-profiles/${id}`, distributorId);
  }

  create(distributorId: string, body: unknown) {
    return this.api.post(`/admin/delivery-profiles`, distributorId, body);
  }

  update(distributorId: string, id: string, body: unknown) {
    return this.api.patch(`/admin/delivery-profiles/${id}`, distributorId, body);
  }

  remove(distributorId: string, id: string) {
    return this.api.delete(`/admin/delivery-profiles/${id}`, distributorId);
  }

  listCutoffRules(distributorId: string, id: string) {
    return this.api.get(`/admin/delivery-profiles/${id}/cutoff-rules`, distributorId);
  }

  createCutoffRule(distributorId: string, id: string, body: unknown) {
    return this.api.post(`/admin/delivery-profiles/${id}/cutoff-rules`, distributorId, body);
  }

  updateCutoffRule(distributorId: string, id: string, ruleId: string, body: unknown) {
    return this.api.patch(`/admin/delivery-profiles/${id}/cutoff-rules/${ruleId}`, distributorId, body);
  }

  removeCutoffRule(distributorId: string, id: string, ruleId: string) {
    return this.api.delete(`/admin/delivery-profiles/${id}/cutoff-rules/${ruleId}`, distributorId);
  }

  assignDeliveryProfile(distributorId: string, trId: string, body: unknown) {
    return this.api.patch(`/admin/trade-relationships/${trId}/delivery-profile`, distributorId, body);
  }
}
