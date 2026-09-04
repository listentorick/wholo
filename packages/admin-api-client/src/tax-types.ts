import type {
  TaxType,
  PaginatedResponse,
  TaxTypeListParams,
  CreateTaxTypeRequest,
  UpdateTaxTypeRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminTaxTypesApi = {
  list(params?: TaxTypeListParams): Promise<PaginatedResponse<TaxType>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return apiFetch<PaginatedResponse<TaxType>>(`/api/v1/tax-types${qs ? `?${qs}` : ''}`);
  },

  get(id: string): Promise<TaxType> {
    return apiFetch<TaxType>(`/api/v1/tax-types/${id}`);
  },

  create(req: CreateTaxTypeRequest): Promise<TaxType> {
    return apiFetch<TaxType>('/api/v1/tax-types', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update(id: string, req: UpdateTaxTypeRequest): Promise<TaxType> {
    return apiFetch<TaxType>(`/api/v1/tax-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  deactivate(id: string): Promise<TaxType> {
    return apiFetch<TaxType>(`/api/v1/tax-types/${id}`, { method: 'DELETE' });
  },
};
