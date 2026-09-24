import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class CustomerHealthService {
  constructor(private readonly api: ApiClientService) {}

  getHealth(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/customer-health`, token);
  }
}
