import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class DeliveryRunsService {
  constructor(private api: ApiClientService) {}

  listDays(distributorId: string, query: Record<string, string>, token: string) {
    const qs = new URLSearchParams(query).toString();
    const suffix = qs ? `?${qs}` : '';
    return this.api.get(`/distributors/${distributorId}/delivery-days${suffix}`, token);
  }

  getDay(distributorId: string, date: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/delivery-days/${date}`, token);
  }

  assignOrderToRun(distributorId: string, runId: string, body: unknown, token: string) {
    return this.api.post(`/distributors/${distributorId}/delivery-runs/${runId}/orders`, token, body);
  }

  // ApiClientService.delete takes no query param, so the ?version= is built
  // into the path here.
  unassignOrderFromRun(distributorId: string, runId: string, orderId: string, version: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/delivery-runs/${runId}/orders/${orderId}?version=${version}`, token);
  }

  reorderRunOrders(distributorId: string, runId: string, body: unknown, token: string) {
    return this.api.patch(`/distributors/${distributorId}/delivery-runs/${runId}/orders/reorder`, token, body);
  }

  updateRun(distributorId: string, runId: string, body: unknown, token: string) {
    return this.api.patch(`/distributors/${distributorId}/delivery-runs/${runId}`, token, body);
  }

  getReschedulePreview(distributorId: string, orderId: string, date: string, token: string) {
    return this.api.get(`/distributors/${distributorId}/orders/${orderId}/reschedule-preview?date=${date}`, token);
  }

  changeScheduledDeliveryDate(distributorId: string, orderId: string, body: unknown, token: string) {
    return this.api.patch(`/distributors/${distributorId}/orders/${orderId}/scheduled-delivery-date`, token, body);
  }
}
