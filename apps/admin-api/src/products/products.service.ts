import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@Injectable()
export class ProductsService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, query: ProductQueryDto) {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return this.api.get(`/admin/products${qs ? `?${qs}` : ''}`, distributorId);
  }

  findOne(id: string, distributorId: string) {
    return this.api.get(`/admin/products/${id}`, distributorId);
  }

  create(distributorId: string, dto: CreateProductDto) {
    return this.api.post('/admin/products', distributorId, dto);
  }

  update(id: string, distributorId: string, dto: UpdateProductDto) {
    return this.api.patch(`/admin/products/${id}`, distributorId, dto);
  }

  remove(id: string, distributorId: string) {
    return this.api.delete(`/admin/products/${id}`, distributorId);
  }
}
