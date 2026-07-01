import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PriceListQueryDto } from './dto/price-list-query.dto';
import { CreatePriceListRuleDto } from './dto/create-price-list-rule.dto';
import { UpdatePriceListRuleDto } from './dto/update-price-list-rule.dto';

@Injectable()
export class PriceListsService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: PriceListQueryDto, token: string) {
    const qs = new URLSearchParams();
    if (query.limit) qs.set('limit', String(query.limit));
    if (query.cursor) qs.set('cursor', query.cursor);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.api.get(`/admin/distributors/${distributorId}/price-lists${suffix}`, token);
  }

  findOne(distributorId: string, id: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/price-lists/${id}`, token);
  }

  create(distributorId: string, dto: CreatePriceListDto, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/price-lists`, token, dto);
  }

  update(distributorId: string, id: string, dto: UpdatePriceListDto, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/price-lists/${id}`, token, dto);
  }

  remove(distributorId: string, id: string, token: string) {
    return this.api.delete(`/admin/distributors/${distributorId}/price-lists/${id}`, token);
  }

  setDefault(distributorId: string, id: string, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/price-lists/${id}/set-default`, token);
  }

  listRules(distributorId: string, id: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/price-lists/${id}/rules`, token);
  }

  createRule(distributorId: string, id: string, dto: CreatePriceListRuleDto, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/price-lists/${id}/rules`, token, dto);
  }

  updateRule(distributorId: string, id: string, ruleId: string, dto: UpdatePriceListRuleDto, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/price-lists/${id}/rules/${ruleId}`, token, dto);
  }

  removeRule(distributorId: string, id: string, ruleId: string, token: string) {
    return this.api.delete(`/admin/distributors/${distributorId}/price-lists/${id}/rules/${ruleId}`, token);
  }
}
