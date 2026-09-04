import type { Supplier } from '@wholo/types';
import { apiFetch } from './base';

export const adminSuppliersApi = {
  list(): Promise<Supplier[]> {
    return apiFetch<Supplier[]>('/api/v1/suppliers');
  },
};
