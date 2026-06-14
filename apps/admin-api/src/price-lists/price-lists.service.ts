import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PriceListQueryDto } from './dto/price-list-query.dto';
import { CreatePriceListRuleDto } from './dto/create-price-list-rule.dto';
import { UpdatePriceListRuleDto } from './dto/update-price-list-rule.dto';
import { AssignPriceListDto } from './dto/assign-price-list.dto';

@Injectable()
export class PriceListsService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: PriceListQueryDto) {
    const qs = new URLSearchParams();
    if (query.limit) qs.set('limit', String(query.limit));
    if (query.cursor) qs.set('cursor', query.cursor);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.api.get(`/admin/price-lists${suffix}`, distributorId);
  }

  findOne(distributorId: string, id: string) {
    return this.api.get(`/admin/price-lists/${id}`, distributorId);
  }

  create(distributorId: string, dto: CreatePriceListDto) {
    return this.api.post(`/admin/price-lists`, distributorId, dto);
  }

  update(distributorId: string, id: string, dto: UpdatePriceListDto) {
    return this.api.patch(`/admin/price-lists/${id}`, distributorId, dto);
  }

  remove(distributorId: string, id: string) {
    return this.api.delete(`/admin/price-lists/${id}`, distributorId);
  }

  setDefault(distributorId: string, id: string) {
    return this.api.post(`/admin/price-lists/${id}/set-default`, distributorId);
  }

  listRules(distributorId: string, id: string) {
    return this.api.get(`/admin/price-lists/${id}/rules`, distributorId);
  }

  createRule(distributorId: string, id: string, dto: CreatePriceListRuleDto) {
    return this.api.post(`/admin/price-lists/${id}/rules`, distributorId, dto);
  }

  updateRule(distributorId: string, id: string, ruleId: string, dto: UpdatePriceListRuleDto) {
    return this.api.patch(`/admin/price-lists/${id}/rules/${ruleId}`, distributorId, dto);
  }

  removeRule(distributorId: string, id: string, ruleId: string) {
    return this.api.delete(`/admin/price-lists/${id}/rules/${ruleId}`, distributorId);
  }

  getProductPricing(distributorId: string, productId: string) {
    return this.api.get(`/admin/products/${productId}/pricing`, distributorId);
  }

  assignPriceList(distributorId: string, trId: string, dto: AssignPriceListDto) {
    return this.api.patch(`/admin/trade-relationships/${trId}/price-list`, distributorId, dto);
  }
}
