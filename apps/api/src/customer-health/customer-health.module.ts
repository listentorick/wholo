import { Module } from '@nestjs/common';
import { CustomerHealthController } from './customer-health.controller';
import { CustomerHealthService } from './customer-health.service';
import { CustomerPaymentsModule } from '../customer-payments/customer-payments.module';

// HTTP-facing — imported by AppModule. Reads order/delivery facts and
// order_analytics_state; never writes to them.
@Module({
  imports: [CustomerPaymentsModule],
  controllers: [CustomerHealthController],
  providers: [CustomerHealthService],
})
export class CustomerHealthModule {}
