import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminDeliveryProfilesService } from './admin-delivery-profiles.service';
import { AdminDeliveryProfilesController } from './admin-delivery-profiles.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminDeliveryProfilesController],
  providers: [AdminDeliveryProfilesService],
  exports: [AdminDeliveryProfilesService],
})
export class DeliveryProfilesModule {}
