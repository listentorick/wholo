import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { DeliveryLinksService } from './delivery-links.service';

// Deliberately unauthenticated (no @UseGuards) — mirrors apps/api's public
// DeliveryLinksController exactly. No :token route param anywhere; the
// X-Delivery-Token header is the sole credential, end to end.
@Controller('delivery-links')
export class DeliveryLinksController {
  constructor(private readonly deliveryLinksService: DeliveryLinksService) {}

  @Get()
  getOrder(@Headers('x-delivery-token') token?: string) {
    return this.deliveryLinksService.getOrder(token ?? '');
  }

  @Post('outcome')
  @HttpCode(200)
  submitOutcome(@Headers('x-delivery-token') token: string | undefined, @Body() dto: unknown) {
    return this.deliveryLinksService.submitOutcome(token ?? '', dto);
  }
}
