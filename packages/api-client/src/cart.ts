import type { CartResponse, UpsertCartItemRequest } from '@wholo/types';
import { apiFetch } from './base';

export const cartApi = {
  getCart(distributorSlug: string): Promise<CartResponse> {
    return apiFetch<CartResponse>(`/api/v1/cart?distributorSlug=${encodeURIComponent(distributorSlug)}`);
  },

  upsertItem(req: UpsertCartItemRequest): Promise<CartResponse> {
    return apiFetch<CartResponse>('/api/v1/cart/items', {
      method: 'PUT',
      body: JSON.stringify(req),
    });
  },
};
