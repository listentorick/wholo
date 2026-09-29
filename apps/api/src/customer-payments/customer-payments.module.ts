import { Module } from '@nestjs/common';
import { CustomerPaymentsController } from './customer-payments.controller';
import { CustomerPaymentsService } from './customer-payments.service';

// HTTP-facing — imported by AppModule. Reads synced invoice state and
// invoice_analytics_state; never writes.
@Module({
  controllers: [CustomerPaymentsController],
  providers: [CustomerPaymentsService],
  exports: [CustomerPaymentsService],
})
export class CustomerPaymentsModule {}
