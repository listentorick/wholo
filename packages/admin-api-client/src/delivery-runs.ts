import type {
  AssignOrderToRunRequest,
  ChangeScheduledDeliveryDateRequest,
  ChangeScheduledDeliveryDateResponse,
  DeliveryDayBoard,
  DeliveryDaysListParams,
  DeliveryDaysListResponse,
  ReorderRunOrdersRequest,
  ReschedulePreviewResponse,
  UpdateDeliveryRunRequest,
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

  updateRun(token: string, runId: string, req: UpdateDeliveryRunRequest): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },

  getReschedulePreview(
    token: string,
    orderId: string,
    date: string,
    signal?: AbortSignal,
  ): Promise<ReschedulePreviewResponse> {
    return apiFetch<ReschedulePreviewResponse>(`/api/v1/orders/${orderId}/reschedule-preview?date=${date}`, {
      token,
      signal,
    });
  },

  changeScheduledDeliveryDate(
    token: string,
    orderId: string,
    req: ChangeScheduledDeliveryDateRequest,
  ): Promise<ChangeScheduledDeliveryDateResponse> {
    return apiFetch<ChangeScheduledDeliveryDateResponse>(`/api/v1/orders/${orderId}/scheduled-delivery-date`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      token,
    });
  },
};
