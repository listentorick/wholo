import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class DeliveryRunsService {
  constructor(private api: ApiClientService) {}

  listDays(distributorId: string, query: Record<string, string>, token: string) {
    const qs = new URLSearchParams(query).toString();
    const suffix = qs ? `?${qs}` : '';
    return this.api.get(`/distributors/${distributorId}/delivery-days${suffix}`, token);
  }

  getDay(distributorId: string, date: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/delivery-days/${date}`, token);
  }
}
