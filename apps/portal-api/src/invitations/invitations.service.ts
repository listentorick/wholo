import { Injectable } from '@nestjs/common';
import type { InvitationCodeSent, PortalInvitationSummary } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class InvitationsService {
  constructor(private api: ApiClientService) {}

  accept(token: string, accessToken: string, code?: string): Promise<{ distributorSlug: string | null }> {
    return this.api.post('/portal/invitations/accept', accessToken, { token, ...(code ? { code } : {}) });
  }

  lookup(token: string): Promise<PortalInvitationSummary> {
    return this.api.post('/portal/invitations/lookup', null, { token });
  }

  sendCode(token: string, accessToken: string): Promise<InvitationCodeSent> {
    return this.api.post('/portal/invitations/email-code', accessToken, { token });
  }
}
