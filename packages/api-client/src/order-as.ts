import { apiFetch } from './base';

export interface OrderAsExchangeResponse {
  sessionToken: string;
  customerId: string;
  customerName: string;
  distributorId: string;
  distributorSlug: string;
}

export const orderAsApi = {
  exchange(deliveryToken: string, token: string): Promise<OrderAsExchangeResponse> {
    return apiFetch<OrderAsExchangeResponse>('/api/v1/auth/order-as/exchange', {
      method: 'POST',
      body: JSON.stringify({ deliveryToken }),
      token,
    });
  },
};
