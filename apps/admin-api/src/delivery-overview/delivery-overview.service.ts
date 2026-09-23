import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class DeliveryOverviewService {
  constructor(private readonly api: ApiClientService) {}

  overview(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/delivery-overview`, token);
  }

  outcomes(distributorId: string, from: string, to: string, token: string) {
    const qs = new URLSearchParams({ from, to }).toString();
    return this.api.get(`/distributors/${distributorId}/delivery-outcomes?${qs}`, token);
  }
}
