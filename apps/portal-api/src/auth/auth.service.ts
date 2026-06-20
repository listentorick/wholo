import { Injectable, Logger } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private api: ApiClientService) {}

  me(token: string) {
    return this.api.get('/auth/me', token);
  }

  async exchangeOrderAsToken(deliveryToken: string, bearerToken: string) {
    this.logger.log('forwarding exchange to apps/api');
    try {
      const result = await this.api.post('/order-as/sessions/exchange', bearerToken, { deliveryToken });
      this.logger.log('exchange succeeded');
      return result;
    } catch (err) {
      this.logger.error(`exchange failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }
}
