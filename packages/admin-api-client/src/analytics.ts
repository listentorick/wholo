import type {
  ActionItemsResponse,
  AnalyticsPeriodQuery,
  CustomerRankingsResponse,
  OrderSummaryResponse,
  OrderTrendResponse,
  ProductRankingsResponse,
} from '@wholo/types';
import { apiFetch } from './base';

function periodQueryString(params: AnalyticsPeriodQuery): string {
  const qs = new URLSearchParams();
  if (params.period) qs.set('period', params.period);
  if (params.start) qs.set('start', params.start);
  if (params.end) qs.set('end', params.end);
  if (params.limit != null) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const adminAnalyticsApi = {
  orderSummary(params: AnalyticsPeriodQuery): Promise<OrderSummaryResponse> {
    return apiFetch<OrderSummaryResponse>(`/api/v1/analytics/order-summary${periodQueryString(params)}`);
  },

  orderTrend(params: AnalyticsPeriodQuery): Promise<OrderTrendResponse> {
    return apiFetch<OrderTrendResponse>(`/api/v1/analytics/order-trend${periodQueryString(params)}`);
  },

  customerRankings(params: AnalyticsPeriodQuery): Promise<CustomerRankingsResponse> {
    return apiFetch<CustomerRankingsResponse>(`/api/v1/analytics/customer-rankings${periodQueryString(params)}`);
  },

  productRankings(params: AnalyticsPeriodQuery): Promise<ProductRankingsResponse> {
    return apiFetch<ProductRankingsResponse>(`/api/v1/analytics/product-rankings${periodQueryString(params)}`);
  },

  actionItems(): Promise<ActionItemsResponse> {
    return apiFetch<ActionItemsResponse>('/api/v1/analytics/action-items');
  },
};
