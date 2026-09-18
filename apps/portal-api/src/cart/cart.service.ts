import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class CartService {
  constructor(private api: ApiClientService) {}

  private async resolveDistributorId(distributorSlug: string, token: string): Promise<string> {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${distributorSlug}`, token);
    return distributor.id;
  }

  async getCart(distributorSlug: string, token: string) {
    const distributorId = await this.resolveDistributorId(distributorSlug, token);
    return this.api.get(`/distributors/${distributorId}/cart`, token);
  }

  async upsertItem(distributorSlug: string, body: unknown, token: string) {
    const distributorId = await this.resolveDistributorId(distributorSlug, token);
    return this.api.put(`/distributors/${distributorId}/cart/items`, token, body);
  }
}
