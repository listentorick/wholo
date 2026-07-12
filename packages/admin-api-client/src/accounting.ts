import type {
  AccountingAuthorizationUrlResponse,
  AccountingConnectionStatusResponse,
  AccountingContactListParams,
  AccountingContactListResponse,
  AccountingContactNeedsAttentionCountResponse,
  AccountingContactSyncRequestedResponse,
  AccountingProductListParams,
  AccountingProductListResponse,
  AccountingProductNeedsAttentionCountResponse,
  AccountingProductSyncRequestedResponse,
  Customer,
  ImportAccountingContactRequest,
  ImportAccountingProductRequest,
  MatchAccountingContactRequest,
  MatchAccountingProductRequest,
  Product,
  UpdateAccountingConnectionSettingsRequest,
} from '@wholo/types';
import { apiFetch } from './base';

function buildListQuery(params: AccountingContactListParams | AccountingProductListParams): string {
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

  updateConnectionSettings(
    body: UpdateAccountingConnectionSettingsRequest,
    token: string,
  ): Promise<AccountingConnectionStatusResponse> {
    return apiFetch<AccountingConnectionStatusResponse>('/api/v1/accounting/connection', {
      method: 'PATCH',
      body: JSON.stringify(body),
      token,
    });
  },

  disconnect(token: string): Promise<void> {
    return apiFetch<void>('/api/v1/accounting/connection', { method: 'DELETE', token });
  },

  retryInvoiceExport(exportId: string, token: string): Promise<{ status: 'requested' }> {
    return apiFetch<{ status: 'requested' }>(`/api/v1/accounting/invoice-exports/${exportId}/retry`, {
      method: 'POST',
      token,
    });
  },

  listContacts(params: AccountingContactListParams, token: string): Promise<AccountingContactListResponse> {
    return apiFetch<AccountingContactListResponse>(`/api/v1/accounting/contacts${buildListQuery(params)}`, { token });
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

  listProducts(params: AccountingProductListParams, token: string): Promise<AccountingProductListResponse> {
    return apiFetch<AccountingProductListResponse>(`/api/v1/accounting/products${buildListQuery(params)}`, { token });
  },

  countProductsNeedingAttention(token: string): Promise<AccountingProductNeedsAttentionCountResponse> {
    return apiFetch<AccountingProductNeedsAttentionCountResponse>('/api/v1/accounting/products/needs-attention-count', {
      token,
    });
  },

  syncProducts(token: string): Promise<AccountingProductSyncRequestedResponse> {
    return apiFetch<AccountingProductSyncRequestedResponse>('/api/v1/accounting/products/sync', {
      method: 'POST',
      token,
    });
  },

  importProduct(
    externalProductId: string,
    dto: ImportAccountingProductRequest,
    token: string,
  ): Promise<Product> {
    return apiFetch<Product>(`/api/v1/accounting/products/${externalProductId}/import`, {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  confirmProductSuggestion(suggestionId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
      token,
    });
  },

  matchProduct(
    externalProductId: string,
    dto: MatchAccountingProductRequest,
    token: string,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/${externalProductId}/match`, {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  ignoreProduct(externalProductId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/${externalProductId}/ignore`, {
      method: 'POST',
      token,
    });
  },

  unlinkProductMapping(mappingId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/mappings/${mappingId}/unlink`, {
      method: 'POST',
      token,
    });
  },
};
