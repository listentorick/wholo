import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class InvitationsService {
  constructor(private api: ApiClientService) {}

  accept(token: string, accessToken: string): Promise<{ distributorSlug: string | null }> {
    return this.api.post('/portal/invitations/accept', accessToken, { token });
  }
}
