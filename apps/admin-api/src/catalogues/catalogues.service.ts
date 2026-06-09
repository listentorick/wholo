import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateCatalogueDto } from './dto/create-catalogue.dto';
import { UpdateCatalogueDto } from './dto/update-catalogue.dto';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

@Injectable()
export class CataloguesService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: CatalogueQueryDto) {
    const qs = new URLSearchParams();
    if (query.limit) qs.set('limit', String(query.limit));
    if (query.cursor) qs.set('cursor', query.cursor);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.api.get(`/admin/catalogues${suffix}`, distributorId);
  }

  findOne(distributorId: string, id: string) {
    return this.api.get(`/admin/catalogues/${id}`, distributorId);
  }

  async create(distributorId: string, dto: CreateCatalogueDto) {
    const { productIds, ...rest } = dto;
    const catalogue = await this.api.post<any>('/admin/catalogues', distributorId, rest);
    if (productIds && productIds.length > 0) {
      return this.api.put(`/admin/catalogues/${catalogue.id}/products`, distributorId, { productIds });
    }
    return catalogue;
  }

  async update(distributorId: string, id: string, dto: UpdateCatalogueDto) {
    const { productIds, ...rest } = dto;
    await this.api.patch(`/admin/catalogues/${id}`, distributorId, rest);
    return this.api.put(`/admin/catalogues/${id}/products`, distributorId, { productIds });
  }

  remove(distributorId: string, id: string) {
    return this.api.delete(`/admin/catalogues/${id}`, distributorId);
  }
}
