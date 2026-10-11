import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryTokenGuard } from './delivery-token.guard';
import { DeliveryTokenVerifier } from './delivery-token.verifier';

@Module({
  imports: [ApiClientModule],
  controllers: [DeliveryLinksController],
  providers: [DeliveryLinksService, DeliveryTokenVerifier, DeliveryTokenGuard],
})
export class DeliveryLinksModule {}
