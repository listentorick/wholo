import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveryLinksService } from './delivery-links.service';
import { SubmitOutcomeDto } from './dto/submit-outcome.dto';

const MAX_PHOTO_BYTES = 12_000_000;

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

  @Post('photos')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a delivery-proof photo (before the outcome is submitted)' })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  uploadPhoto(@Headers('x-delivery-token') token: string | undefined, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No photo provided');
    return this.deliveryLinksService.uploadPhoto(token ?? '', file);
  }

  @Delete('photos/:photoId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a delivery-proof photo (only while the delivery is unrecorded)' })
  deletePhoto(
    @Headers('x-delivery-token') token: string | undefined,
    // Photo ids are server-minted UUIDs — reject anything else before it
    // reaches the DB (no path-ish strings, no injection surface).
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ) {
    return this.deliveryLinksService.deletePhoto(token ?? '', photoId);
  }
}
