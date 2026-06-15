import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class OrdersService {
  constructor(private api: ApiClientService) {}

  submitOrder(body: unknown, token: string) {
    return this.api.post('/orders', token, body);
  }

  listOrders(query: Record<string, string>, token: string) {
    const params = new URLSearchParams(query);
    const qs = params.toString();
    return this.api.get(`/orders${qs ? `?${qs}` : ''}`, token);
  }

  getOrder(orderId: string, token: string) {
    return this.api.get(`/orders/${orderId}`, token);
  }

  cancelOrder(orderId: string, body: unknown, token: string) {
    return this.api.post(`/orders/${orderId}/cancel`, token, body);
  }
}
