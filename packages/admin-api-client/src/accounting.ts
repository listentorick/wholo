import type {
  AccountingAuthorizationUrlResponse,
  AccountingBulkImportJob,
  AccountingConnectionStatusResponse,
  AccountingContactListParams,
  AccountingContactListResponse,
  AccountingContactNeedsAttentionCountResponse,
  AccountingContactSyncRequestedResponse,
  AccountingProductListParams,
  AccountingProductListResponse,
  AccountingProductNeedsAttentionCountResponse,
  AccountingProductSyncRequestedResponse,
  AccountingTaxTypeListParams,
  AccountingTaxTypeListResponse,
  AccountingTaxTypeNeedsAttentionCountResponse,
  AccountingTaxTypeSyncRequestedResponse,
  AccountingTaxTypeSummary,
  BulkImportContactSelectionRequest,
  BulkImportJobResponse,
  BulkImportProductSelectionRequest,
  ConfirmAccountingProductSuggestionRequest,
  Customer,
  ImportAccountingContactRequest,
  ImportAccountingProductRequest,
  ImportAccountingTaxTypeRequest,
  MatchAccountingContactRequest,
  MatchAccountingProductRequest,
  MatchAccountingTaxTypeRequest,
  Product,
  UpdateAccountingConnectionSettingsRequest,
} from '@wholo/types';
import { apiFetch } from './base';

function buildListQuery(params: AccountingContactListParams | AccountingProductListParams): string {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.search) qs.set('search', params.search);
  if (params.status?.length) qs.set('status', params.status.join(','));
  if (params.type?.length) qs.set('type', params.type.join(','));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function buildTaxTypeListQuery(params: AccountingTaxTypeListParams): string {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
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

  bulkImportContacts(dto: BulkImportContactSelectionRequest, token: string): Promise<BulkImportJobResponse> {
    return apiFetch<BulkImportJobResponse>('/api/v1/accounting/contacts/bulk-import', {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  getContactBulkImportJob(jobId: string, token: string): Promise<AccountingBulkImportJob> {
    return apiFetch<AccountingBulkImportJob>(`/api/v1/accounting/contacts/bulk-import-jobs/${jobId}`, { token });
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

  confirmProductSuggestion(
    suggestionId: string,
    token: string,
    dto?: ConfirmAccountingProductSuggestionRequest,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
      token,
      body: JSON.stringify(dto ?? {}),
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

  bulkImportProducts(dto: BulkImportProductSelectionRequest, token: string): Promise<BulkImportJobResponse> {
    return apiFetch<BulkImportJobResponse>('/api/v1/accounting/products/bulk-import', {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  getProductBulkImportJob(jobId: string, token: string): Promise<AccountingBulkImportJob> {
    return apiFetch<AccountingBulkImportJob>(`/api/v1/accounting/products/bulk-import-jobs/${jobId}`, { token });
  },

  acknowledgeProductChange(externalProductId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/${externalProductId}/acknowledge-change`, {
      method: 'POST',
      token,
    });
  },

  acknowledgeContactChange(externalContactId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/${externalContactId}/acknowledge-change`, {
      method: 'POST',
      token,
    });
  },

  listTaxTypes(params: AccountingTaxTypeListParams, token: string): Promise<AccountingTaxTypeListResponse> {
    return apiFetch<AccountingTaxTypeListResponse>(`/api/v1/accounting/tax-types${buildTaxTypeListQuery(params)}`, {
      token,
    });
  },

  countTaxTypesNeedingAttention(token: string): Promise<AccountingTaxTypeNeedsAttentionCountResponse> {
    return apiFetch<AccountingTaxTypeNeedsAttentionCountResponse>('/api/v1/accounting/tax-types/needs-attention-count', {
      token,
    });
  },

  syncTaxTypes(token: string): Promise<AccountingTaxTypeSyncRequestedResponse> {
    return apiFetch<AccountingTaxTypeSyncRequestedResponse>('/api/v1/accounting/tax-types/sync', {
      method: 'POST',
      token,
    });
  },

  importTaxType(
    externalTaxTypeId: string,
    dto: ImportAccountingTaxTypeRequest,
    token: string,
  ): Promise<AccountingTaxTypeSummary> {
    return apiFetch<AccountingTaxTypeSummary>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/import`, {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  confirmTaxTypeSuggestion(suggestionId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
      token,
    });
  },

  matchTaxType(
    externalTaxTypeId: string,
    dto: MatchAccountingTaxTypeRequest,
    token: string,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/match`, {
      method: 'POST',
      token,
      body: JSON.stringify(dto),
    });
  },

  ignoreTaxType(externalTaxTypeId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/ignore`, {
      method: 'POST',
      token,
    });
  },

  unlinkTaxTypeMapping(mappingId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/mappings/${mappingId}/unlink`, {
      method: 'POST',
      token,
    });
  },

  acknowledgeTaxTypeChange(externalTaxTypeId: string, token: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/acknowledge-change`, {
      method: 'POST',
      token,
    });
  },
};
