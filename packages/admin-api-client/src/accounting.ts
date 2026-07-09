import type {
  AccountingAuthorizationUrlResponse,
  AccountingConnectionStatusResponse,
  AccountingContactListParams,
  AccountingContactListResponse,
  AccountingContactNeedsAttentionCountResponse,
  AccountingContactSyncRequestedResponse,
  Customer,
  ImportAccountingContactRequest,
  MatchAccountingContactRequest,
} from '@wholo/types';
import { apiFetch } from './base';

function buildContactQuery(params: AccountingContactListParams): string {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.type) qs.set('type', params.type);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

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

  listContacts(params: AccountingContactListParams, token: string): Promise<AccountingContactListResponse> {
    return apiFetch<AccountingContactListResponse>(`/api/v1/accounting/contacts${buildContactQuery(params)}`, { token });
  },

  countContactsNeedingAttention(token: string): Promise<AccountingContactNeedsAttentionCountResponse> {
    return apiFetch<AccountingContactNeedsAttentionCountResponse>('/api/v1/accounting/contacts/needs-attention-count', {
      token,
    });
  },

  syncContacts(token: string): Promise<AccountingContactSyncRequestedResponse> {
    return apiFetch<AccountingContactSyncRequestedResponse>('/api/v1/accounting/contacts/sync', {
      method: 'POST',
      token,
    });
  },

  importContact(
    externalContactId: string,
    dto: ImportAccountingContactRequest,
    token: string,
  ): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/accounting/contacts/${externalContactId}/import`, {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  confirmSuggestion(suggestionId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
      token,
    });
  },

  matchContact(
    externalContactId: string,
    dto: MatchAccountingContactRequest,
    token: string,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/${externalContactId}/match`, {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  ignoreContact(externalContactId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/${externalContactId}/ignore`, {
      method: 'POST',
      token,
    });
  },

  unlinkMapping(mappingId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/mappings/${mappingId}/unlink`, {
      method: 'POST',
      token,
    });
  },
};
