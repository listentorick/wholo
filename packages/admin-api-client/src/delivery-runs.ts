import type {
  AssignOrderToRunRequest,
  ChangeScheduledDeliveryDateRequest,
  ChangeScheduledDeliveryDateResponse,
  DeliveryDayBoard,
  DeliveryDaysListParams,
  DeliveryDaysListResponse,
  ProblemDetail,
  ReorderRunOrdersRequest,
  ReschedulePreviewResponse,
  UpdateDeliveryRunRequest,
} from '@wholo/types';
import { ApiError, apiFetch, getBaseUrl, getRequestToken } from './base';

export const adminDeliveryRunsApi = {
  listDays(params: DeliveryDaysListParams, signal?: AbortSignal): Promise<DeliveryDaysListResponse> {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    return apiFetch<DeliveryDaysListResponse>(`/api/v1/delivery-days?${query.toString()}`, { signal });
  },

  getDay(date: string, signal?: AbortSignal): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-days/${date}`, { signal });
  },

  assignOrderToRun(runId: string, req: AssignOrderToRunRequest): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}/orders`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  unassignOrderFromRun(runId: string, orderId: string, version: number): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}/orders/${orderId}?version=${version}`, {
      method: 'DELETE',
    });
  },

  reorderRunOrders(runId: string, req: ReorderRunOrdersRequest): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}/orders/reorder`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  updateRun(runId: string, req: UpdateDeliveryRunRequest): Promise<DeliveryDayBoard> {
    return apiFetch<DeliveryDayBoard>(`/api/v1/delivery-runs/${runId}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  getReschedulePreview(
    orderId: string,
    date: string,
    signal?: AbortSignal,
  ): Promise<ReschedulePreviewResponse> {
    return apiFetch<ReschedulePreviewResponse>(`/api/v1/orders/${orderId}/reschedule-preview?date=${date}`, {
      signal,
    });
  },

  changeScheduledDeliveryDate(
    orderId: string,
    req: ChangeScheduledDeliveryDateRequest,
  ): Promise<ChangeScheduledDeliveryDateResponse> {
    return apiFetch<ChangeScheduledDeliveryDateResponse>(`/api/v1/orders/${orderId}/scheduled-delivery-date`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  // Bypasses apiFetch, which always sets Content-Type: application/json and
  // does res.text() -> JSON.parse — wrong for a binary PDF response.
  async downloadManifest(runId: string): Promise<Blob> {
    const token = await getRequestToken();
    const res = await fetch(`${getBaseUrl()}/api/v1/delivery-runs/${runId}/manifest`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      let problem: ProblemDetail;
      try {
        problem = await res.json();
      } catch {
        problem = { type: 'about:blank', title: res.statusText, status: res.status, detail: res.statusText };
      }
      throw new ApiError(problem, res.status);
    }

    return res.blob();
  },
};
