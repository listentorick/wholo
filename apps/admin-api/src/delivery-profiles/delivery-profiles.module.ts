import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { DeliveryProfilesService } from './delivery-profiles.service';
import { DeliveryProfilesController } from './delivery-profiles.controller';

@Module({
  imports: [ApiClientModule],
  controllers: [DeliveryProfilesController],
  providers: [DeliveryProfilesService],
  exports: [DeliveryProfilesService],
})
export class DeliveryProfilesModule {}
