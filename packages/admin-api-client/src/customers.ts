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
  searchOrganisations(token: string, q: string, limit = 10): Promise<OrganisationSearchResult[]> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return apiFetch<OrganisationSearchResult[]>(`/api/v1/customers/organisations/search?${params.toString()}`, { token });
  },

  list(token: string, params?: CustomerListParams): Promise<PaginatedResponse<Customer>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return apiFetch<PaginatedResponse<Customer>>(`/api/v1/customers${qs ? `?${qs}` : ''}`, { token });
  },

  get(token: string, id: string): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}`, { token });
  },

  create(token: string, req: CreateCustomerRequest): Promise<Customer & { inviteUrl: string | null }> {
    return apiFetch<Customer & { inviteUrl: string | null }>('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  update(token: string, id: string, req: UpdateCustomerRequest): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },

  delete(token: string, id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/customers/${id}`, { method: 'DELETE', token });
  },

  invite(token: string, id: string, email?: string): Promise<InviteResponse> {
    return apiFetch<InviteResponse>(`/api/v1/customers/${id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ email }),
      token,
    });
  },
};
