import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class DeliveryRoutesService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: Record<string, string>, token: string) {
    const qs = new URLSearchParams(query).toString();
    const suffix = qs ? `?${qs}` : '';
    return this.api.get(`/distributors/${distributorId}/delivery-routes${suffix}`, token);
  }

  findOne(distributorId: string, id: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/delivery-routes/${id}`, token);
  }

  create(distributorId: string, body: unknown, token: string) {
    return this.api.post(`/distributors/${distributorId}/delivery-routes`, token, body);
  }

  update(distributorId: string, id: string, body: unknown, token: string) {
    return this.api.patch(`/distributors/${distributorId}/delivery-routes/${id}`, token, body);
  }

  remove(distributorId: string, id: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/delivery-routes/${id}`, token);
  }

  listCustomers(distributorId: string, id: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/delivery-routes/${id}/customers`, token);
  }

  assignCustomer(distributorId: string, id: string, body: unknown, token: string) {
    return this.api.post(`/distributors/${distributorId}/delivery-routes/${id}/customers`, token, body);
  }

  removeCustomer(distributorId: string, id: string, customerId: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/delivery-routes/${id}/customers/${customerId}`, token);
  }

  reorderCustomers(distributorId: string, id: string, body: unknown, token: string) {
    return this.api.patch(`/distributors/${distributorId}/delivery-routes/${id}/customers/reorder`, token, body);
  }
}
