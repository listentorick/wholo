import type {
  Order,
  OrderSummary,
  OrderListParams,
  SubmitOrderRequest,
  CancelOrderRequest,
  PaginatedResponse,
} from '@wholo/types';
import { apiFetch } from './base';

export const ordersApi = {
  submitOrder(req: SubmitOrderRequest, token: string): Promise<Order> {
    return apiFetch<Order>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  listOrders(params: OrderListParams, token: string): Promise<PaginatedResponse<OrderSummary>> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.status) qs.set('status', params.status);
    return apiFetch<PaginatedResponse<OrderSummary>>(`/api/v1/orders?${qs.toString()}`, { token });
  },

  getOrder(orderId: string, token: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}`, { token });
  },

  cancelOrder(orderId: string, body: CancelOrderRequest, token: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body),
      token,
    });
  },
};
