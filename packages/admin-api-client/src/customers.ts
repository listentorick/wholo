import type {
  Customer,
  OrganisationSearchResult,
  PaginatedResponse,
  CustomerListParams,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  InviteResponse,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminCustomersApi = {
  searchOrganisations(q: string, limit = 10): Promise<OrganisationSearchResult[]> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return apiFetch<OrganisationSearchResult[]>(`/api/v1/customers/organisations/search?${params.toString()}`);
  },

  list(params?: CustomerListParams): Promise<PaginatedResponse<Customer>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.status?.length) query.set('status', params.status.join(','));
    if (params?.priceListId?.length) query.set('priceListId', params.priceListId.join(','));
    if (params?.deliveryProfileId?.length) query.set('deliveryProfileId', params.deliveryProfileId.join(','));
    if (params?.catalogueId?.length) query.set('catalogueId', params.catalogueId.join(','));
    const qs = query.toString();
    return apiFetch<PaginatedResponse<Customer>>(`/api/v1/customers${qs ? `?${qs}` : ''}`);
  },

  get(id: string): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}`);
  },

  create(req: CreateCustomerRequest): Promise<Customer> {
    return apiFetch<Customer>('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update(id: string, req: UpdateCustomerRequest): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/customers/${id}`, { method: 'DELETE' });
  },

  invite(id: string, email?: string): Promise<InviteResponse> {
    return apiFetch<InviteResponse>(`/api/v1/customers/${id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  acceptRequest(id: string): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}/accept-request`, { method: 'POST' });
  },

  declineRequest(id: string): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}/decline-request`, { method: 'POST' });
  },

  suspend(id: string): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}/suspend`, { method: 'POST' });
  },

  unsuspend(id: string): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}/unsuspend`, { method: 'POST' });
  },

  activate(id: string): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}/activate`, { method: 'POST' });
  },
};
