import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post('photos')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 12_000_000 } }))
  uploadPhoto(@Headers('x-delivery-token') token: string | undefined, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No photo provided');
    return this.deliveryLinksService.uploadPhoto(token ?? '', file);
  }

  @Delete('photos/:photoId')
  @HttpCode(204)
  deletePhoto(@Headers('x-delivery-token') token: string | undefined, @Param('photoId') photoId: string) {
    return this.deliveryLinksService.deletePhoto(token ?? '', photoId);
  }
}
