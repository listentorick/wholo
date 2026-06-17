import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryAvailabilityService } from './delivery-availability.service';
import { DeliveryAvailabilityController } from './delivery-availability.controller';
import { DeliveryAvailabilityProvider } from './delivery-availability.provider';
import { WholoRuleBasedDeliveryAvailabilityProvider } from './wholo-rule-based.provider';

@Module({
  imports: [PrismaModule],
  controllers: [DeliveryAvailabilityController],
  providers: [
    DeliveryAvailabilityService,
    { provide: DeliveryAvailabilityProvider, useClass: WholoRuleBasedDeliveryAvailabilityProvider },
    WholoRuleBasedDeliveryAvailabilityProvider,
  ],
  exports: [DeliveryAvailabilityService],
})
export class DeliveryAvailabilityModule {}
