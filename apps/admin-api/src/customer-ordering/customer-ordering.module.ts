import { Module } from '@nestjs/common';
import { CustomerOrderingController } from './customer-ordering.controller';
import { CustomerOrderingService } from './customer-ordering.service';

@Module({
  providers: [CustomerOrderingService],
  controllers: [CustomerOrderingController],
})
export class CustomerOrderingModule {}
