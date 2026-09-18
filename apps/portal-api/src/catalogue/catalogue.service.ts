import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class CatalogueService {
  constructor(private api: ApiClientService) {}

  getDistributor(slug: string) {
    return this.api.get(`/distributors/${slug}`);
  }

  async getProducts(slug: string, query: Record<string, string>, organisationId: string, token: string) {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${slug}`, token);
    const params = new URLSearchParams(query);
    const qs = params.toString();
    return this.api.get(
      `/distributors/${distributor.id}/customers/${organisationId}/catalogue${qs ? `?${qs}` : ''}`,
      token,
    );
  }

  async getProduct(slug: string, productId: string, organisationId: string, token: string) {
    const distributor = await this.api.get<{ id: string }>(`/distributors/${slug}`, token);
    return this.api.get(
      `/distributors/${distributor.id}/customers/${organisationId}/catalogue/${productId}`,
      token,
    );
  }
}
