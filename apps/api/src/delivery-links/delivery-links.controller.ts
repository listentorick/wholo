import { Body, Controller, Get, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveryLinksService } from './delivery-links.service';
import { SubmitOutcomeDto } from './dto/submit-outcome.dto';

// The first controller in apps/api with no JwtAuthGuard/DistributorAccessGuard
// at all — deliberately public. The X-Delivery-Token header is the sole
// credential (see DeliveryTokenSigner); there is no `:token` route param
// anywhere so the token never appears in a URL, and therefore never in
// Traefik/CDN access logs or Referer headers (see ADR-059).
@ApiTags('Delivery Links')
@UseGuards(ThrottlerGuard)
@Controller('delivery-links')
export class DeliveryLinksController {
  constructor(private readonly deliveryLinksService: DeliveryLinksService) {}

  @Get()
  @ApiOperation({ summary: 'Resolve a delivery link token to its order (or read-only confirmation, if already submitted)' })
  getOrder(@Headers('x-delivery-token') token?: string) {
    return this.deliveryLinksService.getOrder(token ?? '');
  }

  @Post('outcome')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a delivery outcome — single-use per order, idempotent on retry' })
  submitOutcome(@Headers('x-delivery-token') token: string | undefined, @Body() dto: SubmitOutcomeDto) {
    return this.deliveryLinksService.submitOutcome(token ?? '', dto);
  }
}
