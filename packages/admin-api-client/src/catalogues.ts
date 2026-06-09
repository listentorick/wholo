import type {
  Catalogue,
  CatalogueSummary,
  CustomerCatalogueSummary,
  PaginatedResponse,
  CatalogueListParams,
  CreateCatalogueRequest,
  UpdateCatalogueRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminCataloguesApi = {
  list(token: string, params?: CatalogueListParams): Promise<PaginatedResponse<CatalogueSummary>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return apiFetch<PaginatedResponse<CatalogueSummary>>(`/api/v1/catalogues${qs ? `?${qs}` : ''}`, { token });
  },

  get(token: string, id: string): Promise<Catalogue> {
    return apiFetch<Catalogue>(`/api/v1/catalogues/${id}`, { token });
  },

  create(token: string, req: CreateCatalogueRequest): Promise<Catalogue> {
    return apiFetch<Catalogue>('/api/v1/catalogues', {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  update(token: string, id: string, req: UpdateCatalogueRequest): Promise<Catalogue> {
    return apiFetch<Catalogue>(`/api/v1/catalogues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },

  delete(token: string, id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/catalogues/${id}`, { method: 'DELETE', token });
  },

  // Customer catalogue assignment
  getCustomerCatalogues(token: string, customerId: string): Promise<CustomerCatalogueSummary[]> {
    return apiFetch<CustomerCatalogueSummary[]>(`/api/v1/customers/${customerId}/catalogues`, { token });
  },

  assignToCustomer(token: string, customerId: string, catalogueId: string): Promise<CustomerCatalogueSummary[]> {
    return apiFetch<CustomerCatalogueSummary[]>(`/api/v1/customers/${customerId}/catalogues/${catalogueId}`, {
      method: 'POST',
      token,
    });
  },

  unassignFromCustomer(token: string, customerId: string, catalogueId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/customers/${customerId}/catalogues/${catalogueId}`, {
      method: 'DELETE',
      token,
    });
  },
};
