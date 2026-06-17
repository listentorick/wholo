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
    if (params.customerName) qs.set('customerName', params.customerName);
    if (params.statusExclude) qs.set('statusExclude', params.statusExclude);
    if (params.deliveryDateAfter) qs.set('deliveryDateAfter', params.deliveryDateAfter);
    if (params.deliveryDateBefore) qs.set('deliveryDateBefore', params.deliveryDateBefore);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
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
