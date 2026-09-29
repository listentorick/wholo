import { Module } from '@nestjs/common';
import { CustomerPaymentsController } from './customer-payments.controller';
import { CustomerPaymentsService } from './customer-payments.service';

@Module({
  providers: [CustomerPaymentsService],
  controllers: [CustomerPaymentsController],
})
export class CustomerPaymentsModule {}
