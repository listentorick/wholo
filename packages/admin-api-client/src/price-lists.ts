import type {
  PriceList,
  PriceListSummary,
  PriceListRule,
  ProductPricingEntry,
  PaginatedResponse,
  PriceListListParams,
  CreatePriceListRequest,
  UpdatePriceListRequest,
  CreatePriceListRuleRequest,
  UpdatePriceListRuleRequest,
  AssignPriceListRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminPriceListsApi = {
  list(params?: PriceListListParams): Promise<PaginatedResponse<PriceListSummary>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return apiFetch<PaginatedResponse<PriceListSummary>>(`/api/v1/price-lists${qs ? `?${qs}` : ''}`);
  },

  get(id: string): Promise<PriceList> {
    return apiFetch<PriceList>(`/api/v1/price-lists/${id}`);
  },

  create(req: CreatePriceListRequest): Promise<PriceList> {
    return apiFetch<PriceList>('/api/v1/price-lists', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update(id: string, req: UpdatePriceListRequest): Promise<PriceList> {
    return apiFetch<PriceList>(`/api/v1/price-lists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/price-lists/${id}`, { method: 'DELETE' });
  },

  setDefault(id: string): Promise<PriceList> {
    return apiFetch<PriceList>(`/api/v1/price-lists/${id}/set-default`, { method: 'POST' });
  },

  listRules(priceListId: string): Promise<PriceListRule[]> {
    return apiFetch<PriceListRule[]>(`/api/v1/price-lists/${priceListId}/rules`);
  },

  createRule(priceListId: string, req: CreatePriceListRuleRequest): Promise<PriceListRule> {
    return apiFetch<PriceListRule>(`/api/v1/price-lists/${priceListId}/rules`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  updateRule(priceListId: string, ruleId: string, req: UpdatePriceListRuleRequest): Promise<PriceListRule> {
    return apiFetch<PriceListRule>(`/api/v1/price-lists/${priceListId}/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  deleteRule(priceListId: string, ruleId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/price-lists/${priceListId}/rules/${ruleId}`, {
      method: 'DELETE',
    });
  },

  getProductPricing(productId: string): Promise<ProductPricingEntry[]> {
    return apiFetch<ProductPricingEntry[]>(`/api/v1/products/${productId}/pricing`);
  },

  assignToCustomer(customerId: string, req: AssignPriceListRequest): Promise<void> {
    return apiFetch<void>(`/api/v1/customers/${customerId}/price-list`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },
};
