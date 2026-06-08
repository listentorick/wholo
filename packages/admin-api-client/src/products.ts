import type {
  Product,
  PaginatedResponse,
  ProductListParams,
  CreateProductRequest,
  UpdateProductRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminProductsApi = {
  list(token: string, params?: ProductListParams): Promise<PaginatedResponse<Product>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return apiFetch<PaginatedResponse<Product>>(`/api/v1/products${qs ? `?${qs}` : ''}`, { token });
  },

  get(token: string, id: string): Promise<Product> {
    return apiFetch<Product>(`/api/v1/products/${id}`, { token });
  },

  create(token: string, req: CreateProductRequest): Promise<Product> {
    return apiFetch<Product>('/api/v1/products', {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  update(token: string, id: string, req: UpdateProductRequest): Promise<Product> {
    return apiFetch<Product>(`/api/v1/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },

  delete(token: string, id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/products/${id}`, { method: 'DELETE', token });
  },
};
