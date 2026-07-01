import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly api: ApiClientService) {}

  find(distributorId: string, token: string) {
    return this.api.get(`/admin/distributors/${distributorId}/settings`, token);
  }

  update(distributorId: string, dto: UpdateSettingsDto, token: string) {
    return this.api.patch(`/admin/distributors/${distributorId}/settings`, token, dto);
  }
}
