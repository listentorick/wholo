import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

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
