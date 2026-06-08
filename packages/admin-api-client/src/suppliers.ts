import type { Supplier } from '@wholo/types';
import { apiFetch } from './base';

export const adminSuppliersApi = {
  list(token: string): Promise<Supplier[]> {
    return apiFetch<Supplier[]>('/api/v1/suppliers', { token });
  },
};
