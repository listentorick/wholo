import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class CartService {
  constructor(private api: ApiClientService) {}

  getCart(distributorSlug: string, token: string) {
    return this.api.get(`/cart?distributorSlug=${encodeURIComponent(distributorSlug)}`, token);
  }

  upsertItem(body: unknown, token: string) {
    return this.api.put('/cart/items', token, body);
  }
}
