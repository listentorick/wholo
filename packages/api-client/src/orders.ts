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
  submitOrder(req: SubmitOrderRequest): Promise<Order> {
    return apiFetch<Order>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  listOrders(params: OrderListParams): Promise<PaginatedResponse<OrderSummary>> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.status) qs.set('status', params.status);
    if (params.distributorSlug) qs.set('distributorSlug', params.distributorSlug);
    return apiFetch<PaginatedResponse<OrderSummary>>(`/api/v1/orders?${qs.toString()}`);
  },

  getOrder(orderId: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}`);
  },

  cancelOrder(orderId: string, body: CancelOrderRequest): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
