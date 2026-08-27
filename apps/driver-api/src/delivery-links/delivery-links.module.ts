import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryLinksController } from './delivery-links.controller';

@Module({
  imports: [ApiClientModule],
  controllers: [DeliveryLinksController],
  providers: [DeliveryLinksService],
})
export class DeliveryLinksModule {}
