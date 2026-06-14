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
  list(token: string, params?: PriceListListParams): Promise<PaginatedResponse<PriceListSummary>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    const qs = query.toString();
    return apiFetch<PaginatedResponse<PriceListSummary>>(`/api/v1/price-lists${qs ? `?${qs}` : ''}`, { token });
  },

  get(token: string, id: string): Promise<PriceList> {
    return apiFetch<PriceList>(`/api/v1/price-lists/${id}`, { token });
  },

  create(token: string, req: CreatePriceListRequest): Promise<PriceList> {
    return apiFetch<PriceList>('/api/v1/price-lists', {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  update(token: string, id: string, req: UpdatePriceListRequest): Promise<PriceList> {
    return apiFetch<PriceList>(`/api/v1/price-lists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },

  delete(token: string, id: string): Promise<void> {
    return apiFetch<void>(`/api/v1/price-lists/${id}`, { method: 'DELETE', token });
  },

  setDefault(token: string, id: string): Promise<PriceList> {
    return apiFetch<PriceList>(`/api/v1/price-lists/${id}/set-default`, { method: 'POST', token });
  },

  listRules(token: string, priceListId: string): Promise<PriceListRule[]> {
    return apiFetch<PriceListRule[]>(`/api/v1/price-lists/${priceListId}/rules`, { token });
  },

  createRule(token: string, priceListId: string, req: CreatePriceListRuleRequest): Promise<PriceListRule> {
    return apiFetch<PriceListRule>(`/api/v1/price-lists/${priceListId}/rules`, {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  updateRule(token: string, priceListId: string, ruleId: string, req: UpdatePriceListRuleRequest): Promise<PriceListRule> {
    return apiFetch<PriceListRule>(`/api/v1/price-lists/${priceListId}/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },

  deleteRule(token: string, priceListId: string, ruleId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/price-lists/${priceListId}/rules/${ruleId}`, {
      method: 'DELETE',
      token,
    });
  },

  getProductPricing(token: string, productId: string): Promise<ProductPricingEntry[]> {
    return apiFetch<ProductPricingEntry[]>(`/api/v1/products/${productId}/pricing`, { token });
  },

  assignToCustomer(token: string, customerId: string, req: AssignPriceListRequest): Promise<void> {
    return apiFetch<void>(`/api/v1/customers/${customerId}/price-list`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },
};
