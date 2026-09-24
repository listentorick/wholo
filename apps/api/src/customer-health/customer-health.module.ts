import { Module } from '@nestjs/common';
import { CustomerHealthController } from './customer-health.controller';
import { CustomerHealthService } from './customer-health.service';

// HTTP-facing — imported by AppModule. Reads order/delivery facts and
// order_analytics_state; never writes to them.
@Module({
  controllers: [CustomerHealthController],
  providers: [CustomerHealthService],
})
export class CustomerHealthModule {}
