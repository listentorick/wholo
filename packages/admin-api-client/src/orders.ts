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
  DeliveryOutcomeDetail,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminOrdersApi = {
  listOrders(params: OrderListParams): Promise<PaginatedResponse<OrderSummary>> {
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
    return apiFetch<PaginatedResponse<OrderSummary>>(`/api/v1/orders?${qs.toString()}`);
  },

  getOrder(orderId: string): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}`);
  },

  countOrdersNeedingAttention(): Promise<OrderNeedsAttentionCountResponse> {
    return apiFetch<OrderNeedsAttentionCountResponse>('/api/v1/orders/needs-attention-count');
  },

  getOrderAuditLog(
    orderId: string,
    params: AuditLogQueryParams,
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    return apiFetch<PaginatedResponse<AuditLogEntry>>(`/api/v1/orders/${orderId}/audit-log?${qs.toString()}`);
  },

  // Recorded proof of delivery for a DELIVERED / DELIVERY_FAILED order.
  // photos[].url / thumbnailUrl are short-lived presigned R2 URLs — re-call
  // this to refresh them if the drawer stays open past their TTL.
  getDeliveryOutcome(orderId: string): Promise<DeliveryOutcomeDetail> {
    return apiFetch<DeliveryOutcomeDetail>(`/api/v1/orders/${orderId}/delivery-outcome`);
  },

  acceptOrder(orderId: string, body?: AcceptOrderRequest): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/accept`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  },

  rejectOrder(orderId: string, body: RejectOrderRequest): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  cancelOrder(orderId: string, body: CancelOrderRequest): Promise<Order> {
    return apiFetch<Order>(`/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
