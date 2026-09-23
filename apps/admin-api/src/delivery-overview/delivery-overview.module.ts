import { Module } from '@nestjs/common';
import { DeliveryOverviewController } from './delivery-overview.controller';
import { DeliveryOverviewService } from './delivery-overview.service';

@Module({
  providers: [DeliveryOverviewService],
  controllers: [DeliveryOverviewController],
})
export class DeliveryOverviewModule {}
