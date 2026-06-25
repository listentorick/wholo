import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class PortalService {
  constructor(private api: ApiClientService) {}

  getMyDistributors(token: string) {
    return this.api.get('/portal/me/distributors', token);
  }

  getMyProfile(token: string) {
    return this.api.get('/portal/me/profile', token);
  }

  updateMyProfile(token: string, body: unknown) {
    return this.api.patch('/portal/me/profile', token, body);
  }
}
