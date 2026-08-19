import type {
  DeliveryDayBoard,
  DeliveryDaysListParams,
  DeliveryDaysListResponse,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminDeliveryRunsApi = {
  listDays(token: string, params: DeliveryDaysListParams, signal?: AbortSignal): Promise<DeliveryDaysListResponse> {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    return apiFetch<DeliveryDaysListResponse>(`/api/v1/delivery-days?${query.toString()}`, { token, signal });
  },

  getDay(token: string, date: string, signal?: AbortSignal): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-days/${date}`, { token, signal });
  },
};
