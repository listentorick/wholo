import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class CustomerOrderingService {
  constructor(private readonly api: ApiClientService) {}

  getBehaviour(distributorId: string, customerId: string, token: string) {
    return this.api.get(
      `/distributors/${distributorId}/customers/${encodeURIComponent(customerId)}/ordering-behaviour`,
      token,
    );
  }
}
