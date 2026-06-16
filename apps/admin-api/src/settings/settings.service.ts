import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly api: ApiClientService) {}

  find(distributorId: string) {
    return this.api.get('/admin/settings', distributorId);
  }

  update(distributorId: string, dto: UpdateSettingsDto) {
    return this.api.patch('/admin/settings', distributorId, dto);
  }
}
