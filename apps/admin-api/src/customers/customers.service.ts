import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

@Injectable()
export class CustomersService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: CustomerQueryDto) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return this.api.get(`/admin/customers${qs ? `?${qs}` : ''}`, distributorId);
  }

  findOne(id: string, distributorId: string) {
    return this.api.get(`/admin/customers/${id}`, distributorId);
  }

  create(distributorId: string, dto: CreateCustomerDto) {
    return this.api.post('/admin/customers', distributorId, dto);
  }

  update(id: string, distributorId: string, dto: UpdateCustomerDto) {
    return this.api.patch(`/admin/customers/${id}`, distributorId, dto);
  }

  remove(id: string, distributorId: string) {
    return this.api.delete(`/admin/customers/${id}`, distributorId);
  }

  invite(id: string, distributorId: string) {
    return this.api.post(`/admin/customers/${id}/invite`, distributorId);
  }

  getCatalogues(id: string, distributorId: string) {
    return this.api.get(`/admin/trade-relationships/${id}/catalogues`, distributorId);
  }

  assignCatalogue(id: string, catalogueId: string, distributorId: string) {
    return this.api.post(
      `/admin/trade-relationships/${id}/catalogues/${catalogueId}`,
      distributorId,
    );
  }

  unassignCatalogue(id: string, catalogueId: string, distributorId: string) {
    return this.api.delete(
      `/admin/trade-relationships/${id}/catalogues/${catalogueId}`,
      distributorId,
    );
  }

  assignPriceList(id: string, distributorId: string, body: { priceListId: string | null }) {
    return this.api.patch(`/admin/trade-relationships/${id}/price-list`, distributorId, body);
  }
}
