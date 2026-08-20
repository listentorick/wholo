import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryDaysController } from './delivery-days.controller';
import { DeliveryRunsController } from './delivery-runs.controller';

@Module({
  imports: [ApiClientModule],
  controllers: [DeliveryDaysController, DeliveryRunsController],
  providers: [DeliveryRunsService],
  exports: [DeliveryRunsService],
})
export class DeliveryRunsModule {}
