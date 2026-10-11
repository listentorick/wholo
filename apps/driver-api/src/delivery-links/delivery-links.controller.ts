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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryTokenGuard } from './delivery-token.guard';

// No login: the X-Delivery-Token header is the sole credential, end to end,
// and there is no :token route param anywhere. DeliveryTokenGuard checks that
// token's signature before anything else happens — before a body is parsed
// and before the request is forwarded to apps/api, which checks it again.
@UseGuards(DeliveryTokenGuard)
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
