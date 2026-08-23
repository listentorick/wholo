import type {
  Order,
  OrderSummary,
  OrderListParams,
  AcceptOrderRequest,
  RejectOrderRequest,
  CancelOrderRequest,
  PaginatedResponse,
  AuditLogEntry,
  AuditLogQueryParams,
  OrderNeedsAttentionCountResponse,
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
    if (params.undated) qs.set('undated', 'true');
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
    return apiFetch<PaginatedResponse<OrderSummary>>(`/api/v1/orders?${qs.toString()}`, { token });
  },

  getOrder(orderId: string, token: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}`, { token });
  },

  countOrdersNeedingAttention(token: string): Promise<OrderNeedsAttentionCountResponse> {
    return apiFetch<OrderNeedsAttentionCountResponse>('/api/v1/orders/needs-attention-count', { token });
  },

  getOrderAuditLog(
    orderId: string,
    params: AuditLogQueryParams,
    token: string,
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    return apiFetch<PaginatedResponse<AuditLogEntry>>(`/api/v1/orders/${orderId}/audit-log?${qs.toString()}`, {
      token,
    });
  },

  acceptOrder(orderId: string, token: string, body?: AcceptOrderRequest): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/accept`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
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
