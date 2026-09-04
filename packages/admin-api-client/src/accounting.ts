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
  getConnection(): Promise<AccountingConnectionStatusResponse | undefined> {
    return apiFetch<AccountingConnectionStatusResponse | undefined>('/api/v1/accounting/connection');
  },

  createXeroAuthorizationUrl(): Promise<AccountingAuthorizationUrlResponse> {
    return apiFetch<AccountingAuthorizationUrlResponse>('/api/v1/accounting/connections/xero/authorization-url', {
      method: 'POST',
    });
  },

  updateConnectionSettings(
    body: UpdateAccountingConnectionSettingsRequest,
  ): Promise<AccountingConnectionStatusResponse> {
    return apiFetch<AccountingConnectionStatusResponse>('/api/v1/accounting/connection', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  disconnect(): Promise<void> {
    return apiFetch<void>('/api/v1/accounting/connection', { method: 'DELETE' });
  },

  retryInvoiceExport(exportId: string): Promise<{ status: 'requested' }> {
    return apiFetch<{ status: 'requested' }>(`/api/v1/accounting/invoice-exports/${exportId}/retry`, {
      method: 'POST',
    });
  },

  listContacts(params: AccountingContactListParams): Promise<AccountingContactListResponse> {
    return apiFetch<AccountingContactListResponse>(`/api/v1/accounting/contacts${buildListQuery(params)}`);
  },

  countContactsNeedingAttention(): Promise<AccountingContactNeedsAttentionCountResponse> {
    return apiFetch<AccountingContactNeedsAttentionCountResponse>(
      '/api/v1/accounting/contacts/needs-attention-count',
    );
  },

  syncContacts(): Promise<AccountingContactSyncRequestedResponse> {
    return apiFetch<AccountingContactSyncRequestedResponse>('/api/v1/accounting/contacts/sync', {
      method: 'POST',
    });
  },

  importContact(
    externalContactId: string,
    dto: ImportAccountingContactRequest,
  ): Promise<Customer> {
    return apiFetch<Customer>(`/api/v1/accounting/contacts/${externalContactId}/import`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  confirmSuggestion(suggestionId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
    });
  },

  matchContact(
    externalContactId: string,
    dto: MatchAccountingContactRequest,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/${externalContactId}/match`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  ignoreContact(externalContactId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/${externalContactId}/ignore`, {
      method: 'POST',
    });
  },

  unlinkMapping(mappingId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/mappings/${mappingId}/unlink`, {
      method: 'POST',
    });
  },

  bulkImportContacts(dto: BulkImportContactSelectionRequest): Promise<BulkImportJobResponse> {
    return apiFetch<BulkImportJobResponse>('/api/v1/accounting/contacts/bulk-import', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getContactBulkImportJob(jobId: string): Promise<AccountingBulkImportJob> {
    return apiFetch<AccountingBulkImportJob>(`/api/v1/accounting/contacts/bulk-import-jobs/${jobId}`);
  },

  listProducts(params: AccountingProductListParams): Promise<AccountingProductListResponse> {
    return apiFetch<AccountingProductListResponse>(`/api/v1/accounting/products${buildListQuery(params)}`);
  },

  countProductsNeedingAttention(): Promise<AccountingProductNeedsAttentionCountResponse> {
    return apiFetch<AccountingProductNeedsAttentionCountResponse>(
      '/api/v1/accounting/products/needs-attention-count',
    );
  },

  syncProducts(): Promise<AccountingProductSyncRequestedResponse> {
    return apiFetch<AccountingProductSyncRequestedResponse>('/api/v1/accounting/products/sync', {
      method: 'POST',
    });
  },

  importProduct(
    externalProductId: string,
    dto: ImportAccountingProductRequest,
  ): Promise<Product> {
    return apiFetch<Product>(`/api/v1/accounting/products/${externalProductId}/import`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  confirmProductSuggestion(
    suggestionId: string,
    dto?: ConfirmAccountingProductSuggestionRequest,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(dto ?? {}),
    });
  },

  matchProduct(
    externalProductId: string,
    dto: MatchAccountingProductRequest,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/${externalProductId}/match`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  ignoreProduct(externalProductId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/${externalProductId}/ignore`, {
      method: 'POST',
    });
  },

  unlinkProductMapping(mappingId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/mappings/${mappingId}/unlink`, {
      method: 'POST',
    });
  },

  bulkImportProducts(dto: BulkImportProductSelectionRequest): Promise<BulkImportJobResponse> {
    return apiFetch<BulkImportJobResponse>('/api/v1/accounting/products/bulk-import', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getProductBulkImportJob(jobId: string): Promise<AccountingBulkImportJob> {
    return apiFetch<AccountingBulkImportJob>(`/api/v1/accounting/products/bulk-import-jobs/${jobId}`);
  },

  acknowledgeProductChange(externalProductId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/products/${externalProductId}/acknowledge-change`, {
      method: 'POST',
    });
  },

  acknowledgeContactChange(externalContactId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/contacts/${externalContactId}/acknowledge-change`, {
      method: 'POST',
    });
  },

  listTaxTypes(params: AccountingTaxTypeListParams): Promise<AccountingTaxTypeListResponse> {
    return apiFetch<AccountingTaxTypeListResponse>(
      `/api/v1/accounting/tax-types${buildTaxTypeListQuery(params)}`,
    );
  },

  countTaxTypesNeedingAttention(): Promise<AccountingTaxTypeNeedsAttentionCountResponse> {
    return apiFetch<AccountingTaxTypeNeedsAttentionCountResponse>(
      '/api/v1/accounting/tax-types/needs-attention-count',
    );
  },

  syncTaxTypes(): Promise<AccountingTaxTypeSyncRequestedResponse> {
    return apiFetch<AccountingTaxTypeSyncRequestedResponse>('/api/v1/accounting/tax-types/sync', {
      method: 'POST',
    });
  },

  importTaxType(
    externalTaxTypeId: string,
    dto: ImportAccountingTaxTypeRequest,
  ): Promise<AccountingTaxTypeSummary> {
    return apiFetch<AccountingTaxTypeSummary>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/import`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  confirmTaxTypeSuggestion(suggestionId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
    });
  },

  matchTaxType(
    externalTaxTypeId: string,
    dto: MatchAccountingTaxTypeRequest,
  ): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/match`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  ignoreTaxType(externalTaxTypeId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/ignore`, {
      method: 'POST',
    });
  },

  unlinkTaxTypeMapping(mappingId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/mappings/${mappingId}/unlink`, {
      method: 'POST',
    });
  },

  acknowledgeTaxTypeChange(externalTaxTypeId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/accounting/tax-types/${externalTaxTypeId}/acknowledge-change`, {
      method: 'POST',
    });
  },
};
