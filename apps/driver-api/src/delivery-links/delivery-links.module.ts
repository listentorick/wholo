import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryLinkGuard } from './delivery-link.guard';

@Module({
  imports: [ApiClientModule],
  controllers: [DeliveryLinksController],
  providers: [DeliveryLinksService, DeliveryLinkGuard],
})
export class DeliveryLinksModule {}
