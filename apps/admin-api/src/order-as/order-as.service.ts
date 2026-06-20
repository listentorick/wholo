import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class OrderAsService {
  private readonly portalUrl: string;

  constructor(
    private api: ApiClientService,
    config: ConfigService,
  ) {
    this.portalUrl = config.get<string>('PORTAL_URL', 'http://localhost:3010');
  }

  async createSession(distributorId: string, adminUserId: string, tradeRelationshipId: string) {
    const result = await this.api.post<{ deliveryToken: string; distributorSlug: string }>(
      '/order-as/sessions',
      distributorId,
      { tradeRelationshipId },
      adminUserId,
    );
    return { portalUrl: `${this.portalUrl}/${result.distributorSlug}?orderAs=${result.deliveryToken}` };
  }
}
