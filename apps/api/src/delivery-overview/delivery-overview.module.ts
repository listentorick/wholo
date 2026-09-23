import { Module } from '@nestjs/common';
import { DeliveryOutcomesController } from './delivery-outcomes.controller';
import { DeliveryOutcomesService } from './delivery-outcomes.service';
import { DeliveryOverviewController } from './delivery-overview.controller';
import { DeliveryOverviewService } from './delivery-overview.service';

// HTTP-facing (AppModule). Read-only: the live snapshot reads the transactional
// tables; the outcome series reads the delivery facts the worker maintains.
@Module({
  controllers: [DeliveryOverviewController, DeliveryOutcomesController],
  providers: [DeliveryOverviewService, DeliveryOutcomesService],
})
export class DeliveryOverviewModule {}
