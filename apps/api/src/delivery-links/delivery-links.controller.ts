import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveryLinkGuard } from './delivery-link.guard';
import { DeliveryLinkThrottlerGuard } from './delivery-link-throttler.guard';
import { OpenDeliveryOnly } from './open-delivery-only.decorator';
import { DeliveryOrder } from './delivery-order.decorator';
import { DeliveryLinksService, OrderForDeliveryLink } from './delivery-links.service';
import { SubmitOutcomeDto } from './dto/submit-outcome.dto';

const MAX_PHOTO_BYTES = 12_000_000;

// The first controller in apps/api with no JwtAuthGuard/DistributorAccessGuard
// at all — deliberately public. The X-Delivery-Token header is the sole
// credential (see DeliveryLinkTokensService); there is no `:token` route param
// anywhere so the token never appears in a URL, and therefore never in
// Traefik/CDN access logs or Referer headers (see ADR-059).
//
// DeliveryLinkGuard turns that token into its order before anything else
// runs, and on @OpenDeliveryOnly() routes refuses a completed delivery.
// Guards run before interceptors, so such a request is refused before
// FileInterceptor (multer) reads its body (ADR-076). Handlers receive the
// resolved order via @DeliveryOrder(), never the raw header.
@ApiTags('Delivery Links')
@UseGuards(DeliveryLinkThrottlerGuard, DeliveryLinkGuard)
@Controller('delivery-links')
export class DeliveryLinksController {
  constructor(private readonly deliveryLinksService: DeliveryLinksService) {}

  @Get()
  @ApiOperation({ summary: 'Resolve a delivery link token to its order (or read-only confirmation, if already submitted)' })
  getOrder(@DeliveryOrder() order: OrderForDeliveryLink) {
    return this.deliveryLinksService.getOrder(order);
  }

  @Post('outcome')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a delivery outcome — single-use per order, idempotent on retry' })
  submitOutcome(@DeliveryOrder() order: OrderForDeliveryLink, @Body() dto: SubmitOutcomeDto) {
    return this.deliveryLinksService.submitOutcome(order, dto);
  }

  @Post('photos')
  @OpenDeliveryOnly()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a delivery-proof photo (before the outcome is submitted)' })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  uploadPhoto(@DeliveryOrder() order: OrderForDeliveryLink, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No photo provided');
    return this.deliveryLinksService.uploadPhoto(order, file);
  }

  @Delete('photos/:photoId')
  @OpenDeliveryOnly()
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a delivery-proof photo (only while the delivery is unrecorded)' })
  deletePhoto(
    @DeliveryOrder() order: OrderForDeliveryLink,
    // Photo ids are server-minted UUIDs — reject anything else before it
    // reaches the DB (no path-ish strings, no injection surface).
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ) {
    return this.deliveryLinksService.deletePhoto(order, photoId);
  }
}
