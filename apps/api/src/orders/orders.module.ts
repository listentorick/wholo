import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DeliveryAvailabilityModule } from '../delivery-availability/delivery-availability.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [PrismaModule, OutboxModule, DeliveryAvailabilityModule],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
