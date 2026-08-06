import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateTaxTypeDto } from './dto/create-tax-type.dto';
import { UpdateTaxTypeDto } from './dto/update-tax-type.dto';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';

@Injectable()
export class TaxTypesService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: TaxTypeQueryDto, token: string) {
    const qs = new URLSearchParams();
    if (query.limit) qs.set('limit', String(query.limit));
    if (query.cursor) qs.set('cursor', query.cursor);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.api.get(`/distributors/${distributorId}/tax-types${suffix}`, token);
  }

  findOne(distributorId: string, id: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/tax-types/${id}`, token);
  }

  create(distributorId: string, dto: CreateTaxTypeDto, token: string) {
    return this.api.post(`/distributors/${distributorId}/tax-types`, token, dto);
  }

  update(distributorId: string, id: string, dto: UpdateTaxTypeDto, token: string) {
    return this.api.patch(`/distributors/${distributorId}/tax-types/${id}`, token, dto);
  }

  deactivate(distributorId: string, id: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/tax-types/${id}`, token);
  }
}
