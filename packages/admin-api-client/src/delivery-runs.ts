import type {
  AssignOrderToRunRequest,
  DeliveryDayBoard,
  DeliveryDaysListParams,
  DeliveryDaysListResponse,
  ReorderRunOrdersRequest,
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

  assignOrderToRun(token: string, runId: string, req: AssignOrderToRunRequest): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}/orders`, {
      method: 'POST',
      body: JSON.stringify(req),
      token,
    });
  },

  unassignOrderFromRun(token: string, runId: string, orderId: string, version: number): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}/orders/${orderId}?version=${version}`, {
      method: 'DELETE',
      token,
    });
  },

  reorderRunOrders(token: string, runId: string, req: ReorderRunOrdersRequest): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}/orders/reorder`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },
};
