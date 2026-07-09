import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { MatchContactDto } from './dto/match-contact.dto';

@Injectable()
export class AccountingService {
  constructor(private readonly api: ApiClientService) {}

  getConnection(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/accounting/connection`, token);
  }

  createXeroAuthorizationUrl(distributorId: string, token: string) {
    return this.api.post(`/distributors/${distributorId}/accounting/connections/xero/authorization-url`, token);
  }

  disconnect(distributorId: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/accounting/connection`, token);
  }

  listContacts(distributorId: string, query: ContactQueryDto, token: string) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    if (query.type) params.set('type', query.type);
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
