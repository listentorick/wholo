import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

// Thin, unauthenticated passthrough to apps/api's public delivery-links
// endpoints. The X-Delivery-Token header is the sole credential — forwarded
// verbatim as a header on the upstream call, never placed in a URL at any
// hop (see the plan's "Keeping the token out of logs" note).
@Injectable()
export class DeliveryLinksService {
  constructor(private api: ApiClientService) {}

  getOrder(token: string) {
    return this.api.get('/delivery-links', { 'X-Delivery-Token': token });
  }

  submitOutcome(token: string, dto: unknown) {
    return this.api.post('/delivery-links/outcome', { 'X-Delivery-Token': token }, dto);
  }
}
