import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CustomerPaymentsController } from './customer-payments.controller';
import { CustomerPaymentsService } from './customer-payments.service';

// HTTP-facing — imported by AppModule. Reads synced invoice state and
// invoice_analytics_state; never writes. AccountingModule supplies when the
// invoice status last synced.
@Module({
  imports: [AccountingModule],
  controllers: [CustomerPaymentsController],
  providers: [CustomerPaymentsService],
  exports: [CustomerPaymentsService],
})
export class CustomerPaymentsModule {}
