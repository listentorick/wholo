import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetImagesController } from './asset-images.controller';
import { AssetImagesService } from './asset-images.service';
import { ImageProcessingService } from './image-processing.service';
import { R2StorageService } from './r2-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [AssetImagesController],
  providers: [AssetImagesService, ImageProcessingService, R2StorageService],
  exports: [AssetImagesService, R2StorageService],
})
export class AssetImagesModule {}
