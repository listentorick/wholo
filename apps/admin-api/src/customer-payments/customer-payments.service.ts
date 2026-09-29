import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class CustomerPaymentsService {
  constructor(private readonly api: ApiClientService) {}

  getSummary(distributorId: string, customerId: string, token: string) {
    return this.api.get(
      `/distributors/${distributorId}/customers/${encodeURIComponent(customerId)}/payments`,
      token,
    );
  }
}
