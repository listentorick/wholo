import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

@Injectable()
export class CustomersService {
  constructor(private api: ApiClientService) {}

  searchOrganisations(distributorId: string, q: string, token: string, limit?: number) {
    const params = new URLSearchParams({ q });
    if (limit != null) params.set('limit', String(limit));
    return this.api.get(`/admin/distributors/${distributorId}/organisations/search?${params.toString()}`, token);
  }

  findAll(distributorId: string, query: CustomerQueryDto, token: string) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return this.api.get(`/admin/distributors/${distributorId}/customers${qs ? `?${qs}` : ''}`, token);
  }

  findOne(id: string, distributorId: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/customers/${id}`, token);
  }

  create(distributorId: string, dto: CreateCustomerDto, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/customers`, token, dto);
  }

  update(id: string, distributorId: string, dto: UpdateCustomerDto, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/customers/${id}`, token, dto);
  }

  remove(id: string, distributorId: string, token: string) {
    return this.api.delete(`/admin/distributors/${distributorId}/customers/${id}`, token);
  }

  invite(id: string, distributorId: string, token: string, email?: string) {
    return this.api.post(`/admin/distributors/${distributorId}/customers/${id}/invite`, token, { email });
  }

  getCatalogues(id: string, distributorId: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/trade-relationships/${id}/catalogues`, token);
  }

  assignCatalogue(id: string, catalogueId: string, distributorId: string, token: string) {
    return this.api.post(
      `/admin/distributors/${distributorId}/trade-relationships/${id}/catalogues/${catalogueId}`,
      token,
    );
  }

  unassignCatalogue(id: string, catalogueId: string, distributorId: string, token: string) {
    return this.api.delete(
      `/admin/distributors/${distributorId}/trade-relationships/${id}/catalogues/${catalogueId}`,
      token,
    );
  }

  assignPriceList(id: string, distributorId: string, body: { priceListId: string | null }, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/trade-relationships/${id}/price-list`, token, body);
  }

  assignDeliveryProfile(id: string, distributorId: string, body: { deliveryProfileId: string | null }, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/trade-relationships/${id}/delivery-profile`, token, body);
  }
}
