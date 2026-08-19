import type {
  DeliveryRoute,
  DeliveryRouteSummary,
  DeliveryRouteCustomer,
  PaginatedResponse,
  DeliveryRouteListParams,
  CreateDeliveryRouteRequest,
  UpdateDeliveryRouteRequest,
  AssignRouteCustomerRequest,
  ReorderRouteCustomersRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminDeliveryRoutesApi = {
  list(token: string, params?: DeliveryRouteListParams): Promise<PaginatedResponse<DeliveryRouteSummary>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.active !== undefined) query.set('active', String(params.active));
    const qs = query.toString();
    return apiFetch<PaginatedResponse<DeliveryRouteSummary>>(
      `/api/v1/delivery-routes${qs ? `?${qs}` : ''}`,
      { token },
    );
  },

  get(token: string, id: string): Promise<DeliveryRoute> {
    return apiFetch<DeliveryRoute>(`/api/v1/delivery-routes/${id}`, { token });
  },

  create(token: string, req: CreateDeliveryRouteRequest): Promise<DeliveryRoute> {
    return apiFetch<DeliveryRoute>('/api/v1/delivery-routes', {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  update(token: string, id: string, req: UpdateDeliveryRouteRequest): Promise<DeliveryRoute> {
    return apiFetch<DeliveryRoute>(`/api/v1/delivery-routes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },

  delete(token: string, id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/delivery-routes/${id}`, { method: 'DELETE', token });
  },

  listCustomers(token: string, routeId: string): Promise<DeliveryRouteCustomer[]> {
    return apiFetch<DeliveryRouteCustomer[]>(`/api/v1/delivery-routes/${routeId}/customers`, { token });
  },

  assignCustomer(token: string, routeId: string, req: AssignRouteCustomerRequest): Promise<DeliveryRouteCustomer> {
    return apiFetch<DeliveryRouteCustomer>(`/api/v1/delivery-routes/${routeId}/customers`, {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  removeCustomer(token: string, routeId: string, customerId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/delivery-routes/${routeId}/customers/${customerId}`, {
      method: 'DELETE',
      token,
    });
  },

  reorderCustomers(token: string, routeId: string, req: ReorderRouteCustomersRequest): Promise<DeliveryRouteCustomer[]> {
    return apiFetch<DeliveryRouteCustomer[]>(`/api/v1/delivery-routes/${routeId}/customers/reorder`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },
};
