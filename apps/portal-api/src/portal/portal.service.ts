import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class PortalService {
  constructor(private api: ApiClientService) {}

  getMyDistributors(token: string) {
    return this.api.get('/portal/me/distributors', token);
  }
}
