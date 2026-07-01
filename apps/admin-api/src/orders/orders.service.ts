import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@Injectable()
export class OrdersService {
  constructor(private api: ApiClientService) {}

  listOrders(distributorId: string, query: OrderQueryDto, token: string) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.status) params.set('status', query.status);
    if (query.customerName) params.set('customerName', query.customerName);
    if (query.statusExclude) params.set('statusExclude', query.statusExclude);
    if (query.deliveryDateAfter) params.set('deliveryDateAfter', query.deliveryDateAfter);
    if (query.deliveryDateBefore) params.set('deliveryDateBefore', query.deliveryDateBefore);
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortOrder) params.set('sortOrder', query.sortOrder);
    const qs = params.toString();
    return this.api.get(`/admin/distributors/${distributorId}/orders${qs ? `?${qs}` : ''}`, token);
  }

  getOrder(orderId: string, distributorId: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/orders/${orderId}`, token);
  }

  acceptOrder(orderId: string, distributorId: string, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/orders/${orderId}/accept`, token);
  }

  rejectOrder(orderId: string, distributorId: string, dto: RejectOrderDto, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/orders/${orderId}/reject`, token, dto);
  }

  cancelOrder(orderId: string, distributorId: string, dto: CancelOrderDto, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/orders/${orderId}/cancel`, token, dto);
  }
}
