import { apiFetch } from './base';

export interface OrderAsSessionResponse {
  portalUrl: string;
}

export const adminOrderAsApi = {
  createSession(token: string, customerId: string): Promise<OrderAsSessionResponse> {
    return apiFetch<OrderAsSessionResponse>(`/api/v1/customers/${customerId}/order-as`, {
      method: 'POST',
      body: JSON.stringify({}),
      token,
    });
  },
};
