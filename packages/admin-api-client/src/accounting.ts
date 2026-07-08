import type { AccountingAuthorizationUrlResponse, AccountingConnectionStatusResponse } from '@wholo/types';
import { apiFetch } from './base';

export const adminAccountingApi = {
  getConnection(token: string): Promise<AccountingConnectionStatusResponse | undefined> {
    return apiFetch<AccountingConnectionStatusResponse | undefined>('/api/v1/accounting/connection', { token });
  },

  createXeroAuthorizationUrl(token: string): Promise<AccountingAuthorizationUrlResponse> {
    return apiFetch<AccountingAuthorizationUrlResponse>('/api/v1/accounting/connections/xero/authorization-url', {
      method: 'POST',
      token,
    });
  },

  disconnect(token: string): Promise<void> {
    return apiFetch<void>('/api/v1/accounting/connection', { method: 'DELETE', token });
  },
};
