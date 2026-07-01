import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@Injectable()
export class ProductsService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: ProductQueryDto, token: string) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return this.api.get(`/admin/distributors/${distributorId}/products${qs ? `?${qs}` : ''}`, token);
  }

  findOne(id: string, distributorId: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/products/${id}`, token);
  }

  create(distributorId: string, dto: CreateProductDto, token: string) {
    return this.api.post(`/admin/distributors/${distributorId}/products`, token, dto);
  }

  update(id: string, distributorId: string, dto: UpdateProductDto, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/products/${id}`, token, dto);
  }

  remove(id: string, distributorId: string, token: string) {
    return this.api.delete(`/admin/distributors/${distributorId}/products/${id}`, token);
  }
}
