import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { PeriodQueryDto } from './dto/period-query.dto';

function periodQueryString(query: PeriodQueryDto, extra?: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  if (query.period) params.set('period', query.period);
  if (query.start) params.set('start', query.start);
  if (query.end) params.set('end', query.end);
  if (query.limit != null) params.set('limit', String(query.limit));
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value != null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly api: ApiClientService) {}

  orderSummary(distributorId: string, query: PeriodQueryDto, token: string) {
    return this.api.get(`/distributors/${distributorId}/order-summary${periodQueryString(query)}`, token);
  }

  orderTrend(distributorId: string, query: PeriodQueryDto, token: string) {
    return this.api.get(`/distributors/${distributorId}/order-trend${periodQueryString(query)}`, token);
  }

  customerRankings(distributorId: string, query: PeriodQueryDto, token: string) {
    return this.api.get(`/distributors/${distributorId}/customer-rankings${periodQueryString(query)}`, token);
  }

  productRankings(distributorId: string, query: PeriodQueryDto, token: string) {
    return this.api.get(`/distributors/${distributorId}/product-rankings${periodQueryString(query)}`, token);
  }

  actionItems(distributorId: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/action-items`, token);
  }
}
