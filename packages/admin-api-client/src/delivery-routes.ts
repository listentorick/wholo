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
  list(params?: DeliveryRouteListParams): Promise<PaginatedResponse<DeliveryRouteSummary>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.active !== undefined) query.set('active', String(params.active));
    const qs = query.toString();
    return apiFetch<PaginatedResponse<DeliveryRouteSummary>>(
      `/api/v1/delivery-routes${qs ? `?${qs}` : ''}`,
    );
  },

  get(id: string): Promise<DeliveryRoute> {
    return apiFetch<DeliveryRoute>(`/api/v1/delivery-routes/${id}`);
  },

  create(req: CreateDeliveryRouteRequest): Promise<DeliveryRoute> {
    return apiFetch<DeliveryRoute>('/api/v1/delivery-routes', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update(id: string, req: UpdateDeliveryRouteRequest): Promise<DeliveryRoute> {
    return apiFetch<DeliveryRoute>(`/api/v1/delivery-routes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/delivery-routes/${id}`, { method: 'DELETE' });
  },

  listCustomers(routeId: string): Promise<DeliveryRouteCustomer[]> {
    return apiFetch<DeliveryRouteCustomer[]>(`/api/v1/delivery-routes/${routeId}/customers`);
  },

  assignCustomer(routeId: string, req: AssignRouteCustomerRequest): Promise<DeliveryRouteCustomer> {
    return apiFetch<DeliveryRouteCustomer>(`/api/v1/delivery-routes/${routeId}/customers`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  removeCustomer(routeId: string, customerId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/delivery-routes/${routeId}/customers/${customerId}`, {
      method: 'DELETE',
    });
  },

  reorderCustomers(routeId: string, req: ReorderRouteCustomersRequest): Promise<DeliveryRouteCustomer[]> {
    return apiFetch<DeliveryRouteCustomer[]>(`/api/v1/delivery-routes/${routeId}/customers/reorder`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },
};
