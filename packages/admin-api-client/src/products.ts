import type {
  Product,
  PaginatedResponse,
  ProductListParams,
  CreateProductRequest,
  UpdateProductRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminProductsApi = {
  list(params?: ProductListParams): Promise<PaginatedResponse<Product>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.status?.length) query.set('status', params.status.join(','));
    if (params?.productTypeId?.length) query.set('productTypeId', params.productTypeId.join(','));
    if (params?.supplierId?.length) query.set('supplierId', params.supplierId.join(','));
    const qs = query.toString();
    return apiFetch<PaginatedResponse<Product>>(`/api/v1/products${qs ? `?${qs}` : ''}`);
  },

  get(id: string): Promise<Product> {
    return apiFetch<Product>(`/api/v1/products/${id}`);
  },

  create(req: CreateProductRequest): Promise<Product> {
    return apiFetch<Product>('/api/v1/products', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update(id: string, req: UpdateProductRequest): Promise<Product> {
    return apiFetch<Product>(`/api/v1/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/products/${id}`, { method: 'DELETE' });
  },
};
