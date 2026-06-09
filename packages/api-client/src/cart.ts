import type { CartResponse, UpsertCartItemRequest } from '@wholo/types';
import { apiFetch } from './base';

export const cartApi = {
  getCart(distributorSlug: string, token: string): Promise<CartResponse> {
    return apiFetch<CartResponse>(`/api/v1/cart?distributorSlug=${encodeURIComponent(distributorSlug)}`, { token });
  },

  upsertItem(req: UpsertCartItemRequest, token: string): Promise<CartResponse> {
    return apiFetch<CartResponse>('/api/v1/cart/items', {
      method: 'PUT',
      body: JSON.stringify(req),
      token,
    });
  },
};
