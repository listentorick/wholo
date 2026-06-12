import type {
  Order,
  OrderSummary,
  OrderListParams,
  RejectOrderRequest,
  CancelOrderRequest,
  PaginatedResponse,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminOrdersApi = {
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

  acceptOrder(orderId: string, token: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
      token,
    });
  },

  rejectOrder(orderId: string, body: RejectOrderRequest, token: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
      token,
    });
  },

  cancelOrder(orderId: string, body: CancelOrderRequest, token: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body),
      token,
    });
  },
};
