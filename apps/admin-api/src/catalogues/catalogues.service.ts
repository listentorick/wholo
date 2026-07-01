import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateCatalogueDto } from './dto/create-catalogue.dto';
import { UpdateCatalogueDto } from './dto/update-catalogue.dto';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

@Injectable()
export class CataloguesService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: CatalogueQueryDto, token: string) {
    const qs = new URLSearchParams();
    if (query.limit) qs.set('limit', String(query.limit));
    if (query.cursor) qs.set('cursor', query.cursor);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.api.get(`/admin/distributors/${distributorId}/catalogues${suffix}`, token);
  }

  findOne(distributorId: string, id: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/catalogues/${id}`, token);
  }

  async create(distributorId: string, dto: CreateCatalogueDto, token: string) {
    const { productIds, ...rest } = dto;
    const catalogue = await this.api.post<any>(`/admin/distributors/${distributorId}/catalogues`, token, rest);
    if (productIds && productIds.length > 0) {
      return this.api.put(`/admin/distributors/${distributorId}/catalogues/${catalogue.id}/products`, token, { productIds });
    }
    return catalogue;
  }

  async update(distributorId: string, id: string, dto: UpdateCatalogueDto, token: string) {
    const { productIds, ...rest } = dto;
    await this.api.patch(`/admin/distributors/${distributorId}/catalogues/${id}`, token, rest);
    return this.api.put(`/admin/distributors/${distributorId}/catalogues/${id}/products`, token, { productIds });
  }

  remove(distributorId: string, id: string, token: string) {
    return this.api.delete(`/admin/distributors/${distributorId}/catalogues/${id}`, token);
  }
}
