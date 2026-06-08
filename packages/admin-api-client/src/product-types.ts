import type { ProductType } from '@wholo/types';
import { apiFetch } from './base';

export const adminProductTypesApi = {
  list(token: string): Promise<ProductType[]> {
    return apiFetch<ProductType[]>('/api/v1/product-types', { token });
  },
};
