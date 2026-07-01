import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class SuppliersService {
  constructor(private api: ApiClientService) {}

  findAll(distributorId: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/suppliers`, token);
  }
}
