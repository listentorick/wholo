import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { AssetImagesController } from './asset-images.controller';
import { AssetImagesService } from './asset-images.service';

@Module({
  imports: [ApiClientModule],
  controllers: [AssetImagesController],
  providers: [AssetImagesService],
})
export class AssetImagesModule {}
