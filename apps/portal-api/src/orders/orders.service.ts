import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { SubmitOrderDto } from './orders.controller';

@Injectable()
export class OrdersService {
  constructor(private api: ApiClientService) {}

  private async resolveDistributorId(distributorSlug: string, token: string): Promise<string> {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${distributorSlug}`, token);
    return distributor.id;
  }

  async submitOrder(dto: SubmitOrderDto, token: string) {
    const { distributorSlug, ...rest } = dto;
    const distributorId = await this.resolveDistributorId(distributorSlug, token);
    return this.api.post(`/distributors/${distributorId}/orders`, token, rest);
  }

  async listOrders(organisationId: string, query: Record<string, string>, token: string) {
    const { distributorSlug, ...rest } = query;
    const params: Record<string, string> = { ...rest };
    if (distributorSlug) {
      params.distributorId = await this.resolveDistributorId(distributorSlug, token);
    }
    const qs = new URLSearchParams(params).toString();
    return this.api.get(`/organisations/${organisationId}/orders${qs ? `?${qs}` : ''}`, token);
  }

  getOrder(orderId: string, token: string) {
    return this.api.get(`/orders/${orderId}`, token);
  }

  cancelOrder(orderId: string, body: unknown, token: string) {
    return this.api.post(`/orders/${orderId}/cancel`, token, body);
  }
}
