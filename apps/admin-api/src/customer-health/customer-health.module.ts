import { Module } from '@nestjs/common';
import { CustomerHealthController } from './customer-health.controller';
import { CustomerHealthService } from './customer-health.service';

@Module({
  providers: [CustomerHealthService],
  controllers: [CustomerHealthController],
})
export class CustomerHealthModule {}
