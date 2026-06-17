import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';

@Module({
  imports: [ApiClientModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
