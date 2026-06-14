import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@Injectable()
export class OrdersService {
  constructor(private api: ApiClientService) {}

  listOrders(distributorId: string, query: OrderQueryDto) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return this.api.get(`/admin/orders${qs ? `?${qs}` : ''}`, distributorId);
  }

  getOrder(orderId: string, distributorId: string) {
    return this.api.get(`/admin/orders/${orderId}`, distributorId);
  }

  acceptOrder(orderId: string, distributorId: string, userId: string) {
    return this.api.post(`/admin/orders/${orderId}/accept`, distributorId, undefined, userId);
  }

  rejectOrder(orderId: string, distributorId: string, userId: string, dto: RejectOrderDto) {
    return this.api.post(`/admin/orders/${orderId}/reject`, distributorId, dto, userId);
  }

  cancelOrder(orderId: string, distributorId: string, userId: string, dto: CancelOrderDto) {
    return this.api.post(`/admin/orders/${orderId}/cancel`, distributorId, dto, userId);
  }
}
