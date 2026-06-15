import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class CatalogueService {
  constructor(private api: ApiClientService) {}

  getDistributor(slug: string) {
    return this.api.get(`/catalogue/${slug}`);
  }

  getProducts(slug: string, query: Record<string, string>, token: string) {
    const params = new URLSearchParams(query);
    const qs = params.toString();
    return this.api.get(`/catalogue/${slug}/products${qs ? `?${qs}` : ''}`, token);
  }
}
