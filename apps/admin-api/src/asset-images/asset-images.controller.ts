import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetImagesService } from './asset-images.service';

@UseGuards(JwtAuthGuard)
@Controller('asset-images')
export class AssetImagesController {
  constructor(private readonly service: AssetImagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() req: Request,
    @Body('assetType') assetType: string,
    @Body('entityId') entityId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    if (!file) throw new BadRequestException('No file provided');
    if (!assetType) throw new BadRequestException('assetType is required');
    if (!entityId) throw new BadRequestException('entityId is required');
    return this.service.upload(organisationId, assetType, entityId, file, token);
  }

  @Get()
  list(
    @Req() req: Request,
    @Query('assetType') assetType: string,
    @Query('entityId') entityId: string,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    if (!assetType) throw new BadRequestException('assetType is required');
    if (!entityId) throw new BadRequestException('entityId is required');
    return this.service.list(organisationId, assetType, entityId, token);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.delete(organisationId, id, token);
  }

  @Put('reorder')
  reorder(
    @Req() req: Request,
    @Body('assetType') assetType: string,
    @Body('entityId') entityId: string,
    @Body('imageIds') imageIds: string[],
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.reorder(organisationId, assetType, entityId, imageIds, token);
  }
}
