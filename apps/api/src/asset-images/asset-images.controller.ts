import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AssetImagesService } from './asset-images.service';
import { UploadAssetImageDto } from './dto/upload-asset-image.dto';
import { ReorderAssetImagesDto } from './dto/reorder-asset-images.dto';

@ApiTags('Admin / Asset Images')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin/asset-images')
export class AssetImagesController {
  constructor(private readonly service: AssetImagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image for an asset' })
  upload(
    @Headers('x-distributor-id') distributorId: string,
    @Body() dto: UploadAssetImageDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.service.upload(dto.assetType, dto.entityId, distributorId, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List images for an asset' })
  list(
    @Headers('x-distributor-id') distributorId: string,
    @Query('assetType') assetType: string,
    @Query('entityId') entityId: string,
  ) {
    if (!assetType) throw new BadRequestException('assetType query param is required');
    if (!entityId) throw new BadRequestException('entityId query param is required');
    return this.service.list(assetType, entityId, distributorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an image' })
  delete(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.delete(id, distributorId);
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder images for an asset' })
  reorder(
    @Headers('x-distributor-id') distributorId: string,
    @Body() dto: ReorderAssetImagesDto,
  ) {
    return this.service.reorder(dto.assetType, dto.entityId, distributorId, dto.imageIds);
  }
}
