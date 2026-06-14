import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class ProductTypesService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string) {
    return this.api.get('/admin/product-types', distributorId);
  }
}
