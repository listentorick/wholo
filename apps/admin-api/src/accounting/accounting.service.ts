import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { MatchContactDto } from './dto/match-contact.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ImportProductDto } from './dto/import-product.dto';
import { MatchProductDto } from './dto/match-product.dto';
import { ConfirmProductSuggestionDto } from './dto/confirm-product-suggestion.dto';
import { UpdateConnectionSettingsDto } from './dto/update-connection-settings.dto';
import { BulkImportContactSelectionDto } from './dto/bulk-import-contact-selection.dto';
import { BulkImportProductSelectionDto } from './dto/bulk-import-product-selection.dto';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';
import { ImportTaxTypeDto } from './dto/import-tax-type.dto';
import { MatchTaxTypeDto } from './dto/match-tax-type.dto';

@Injectable()
export class AccountingService {
  constructor(private readonly api: ApiClientService) {}

  getConnection(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/accounting/connection`, token);
  }

  createXeroAuthorizationUrl(distributorId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/connections/xero/authorization-url`, token);
  }

  updateConnectionSettings(distributorId: string, dto: UpdateConnectionSettingsDto, token: string) {
    return this.api.patch(`/distributors/${distributorId}/accounting/connection`, token, dto);
  }

  retryInvoiceExport(distributorId: string, exportId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/invoice-exports/${exportId}/retry`, token);
  }

  disconnect(distributorId: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/accounting/connection`, token);
  }

  listContacts(distributorId: string, query: ContactQueryDto, token: string) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.search) params.set('search', query.search);
    if (query.status?.length) params.set('status', query.status.join(','));
    if (query.type?.length) params.set('type', query.type.join(','));
    const qs = params.toString();
    return this.api.get(`/distributors/${distributorId}/accounting/contacts${qs ? `?${qs}` : ''}`, token);
  }

  countContactsNeedingAttention(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/accounting/contacts/needs-attention-count`, token);
  }

  syncContacts(distributorId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/sync`, token);
  }

  importContact(distributorId: string, externalContactId: string, dto: ImportContactDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/${externalContactId}/import`, token, dto);
  }

  confirmSuggestion(distributorId: string, suggestionId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/suggestions/${suggestionId}/confirm`, token);
  }

  matchContact(distributorId: string, externalContactId: string, dto: MatchContactDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/${externalContactId}/match`, token, dto);
  }

  ignoreContact(distributorId: string, externalContactId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/${externalContactId}/ignore`, token);
  }

  unlinkMapping(distributorId: string, mappingId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/mappings/${mappingId}/unlink`, token);
  }

  bulkImportContacts(distributorId: string, dto: BulkImportContactSelectionDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/bulk-import`, token, dto);
  }

  getContactBulkImportJob(distributorId: string, jobId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/accounting/contacts/bulk-import-jobs/${jobId}`, token);
  }

  listProducts(distributorId: string, query: ProductQueryDto, token: string) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.search) params.set('search', query.search);
    if (query.status?.length) params.set('status', query.status.join(','));
    if (query.type?.length) params.set('type', query.type.join(','));
    const qs = params.toString();
    return this.api.get(`/distributors/${distributorId}/accounting/products${qs ? `?${qs}` : ''}`, token);
  }

  countProductsNeedingAttention(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/accounting/products/needs-attention-count`, token);
  }

  syncProducts(distributorId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/sync`, token);
  }

  importProduct(distributorId: string, externalProductId: string, dto: ImportProductDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/${externalProductId}/import`, token, dto);
  }

  confirmProductSuggestion(distributorId: string, suggestionId: string, dto: ConfirmProductSuggestionDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/suggestions/${suggestionId}/confirm`, token, dto);
  }

  matchProduct(distributorId: string, externalProductId: string, dto: MatchProductDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/${externalProductId}/match`, token, dto);
  }

  ignoreProduct(distributorId: string, externalProductId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/${externalProductId}/ignore`, token);
  }

  unlinkProductMapping(distributorId: string, mappingId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/mappings/${mappingId}/unlink`, token);
  }

  bulkImportProducts(distributorId: string, dto: BulkImportProductSelectionDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/bulk-import`, token, dto);
  }

  getProductBulkImportJob(distributorId: string, jobId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/accounting/products/bulk-import-jobs/${jobId}`, token);
  }

  acknowledgeProductChange(distributorId: string, externalProductId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/products/${externalProductId}/acknowledge-change`, token);
  }

  acknowledgeContactChange(distributorId: string, externalContactId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/contacts/${externalContactId}/acknowledge-change`, token);
  }

  listTaxTypes(distributorId: string, query: TaxTypeQueryDto, token: string) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    const qs = params.toString();
    return this.api.get(`/distributors/${distributorId}/accounting/tax-types${qs ? `?${qs}` : ''}`, token);
  }

  countTaxTypesNeedingAttention(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/accounting/tax-types/needs-attention-count`, token);
  }

  syncTaxTypes(distributorId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/tax-types/sync`, token);
  }

  importTaxType(distributorId: string, externalTaxTypeId: string, dto: ImportTaxTypeDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/tax-types/${externalTaxTypeId}/import`, token, dto);
  }

  confirmTaxTypeSuggestion(distributorId: string, suggestionId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/tax-types/suggestions/${suggestionId}/confirm`, token);
  }

  matchTaxType(distributorId: string, externalTaxTypeId: string, dto: MatchTaxTypeDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/tax-types/${externalTaxTypeId}/match`, token, dto);
  }

  ignoreTaxType(distributorId: string, externalTaxTypeId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/tax-types/${externalTaxTypeId}/ignore`, token);
  }

  unlinkTaxTypeMapping(distributorId: string, mappingId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/tax-types/mappings/${mappingId}/unlink`, token);
  }

  acknowledgeTaxTypeChange(distributorId: string, externalTaxTypeId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/tax-types/${externalTaxTypeId}/acknowledge-change`, token);
  }

  // Server-to-server, no bearer token — this is admin-api forwarding Xero's
  // browser redirect payload to apps/api's internal callback endpoint, not a
  // call made on behalf of an authenticated user.
  handleXeroCallback(
    callbackUrl: string,
    code: string | undefined,
    state: string | undefined,
  ): Promise<{ status: 'connected' } | { status: 'error'; reason: string }> {
    return this.api.postAnonymous('/accounting/xero/callback', { callbackUrl, code, state });
  }
}
