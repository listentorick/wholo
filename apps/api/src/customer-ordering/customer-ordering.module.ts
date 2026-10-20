import { Module } from '@nestjs/common';
import { CustomerOrderingController } from './customer-ordering.controller';
import { CustomerOrderingService } from './customer-ordering.service';

// HTTP-facing — imported by AppModule. Reads order_analytics_state and
// order_line_facts; never writes.
@Module({
  controllers: [CustomerOrderingController],
  providers: [CustomerOrderingService],
})
export class CustomerOrderingModule {}
