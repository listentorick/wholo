import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class DeliveryService {
  constructor(private api: ApiClientService) {}

  getAvailableDates(distributorSlug: string, token: string) {
    return this.api.get(
      `/delivery/available-dates?distributorSlug=${encodeURIComponent(distributorSlug)}`,
      token,
    );
  }
}
