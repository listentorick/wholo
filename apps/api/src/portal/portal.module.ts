import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { AssetImagesModule } from '../asset-images/asset-images.module';

@Module({
  imports: [AssetImagesModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
