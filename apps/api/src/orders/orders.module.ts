import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuditModule } from '../audit/audit.module';
import { DeliveryAvailabilityModule } from '../delivery-availability/delivery-availability.module';
import { MetricsModule } from '../metrics/metrics.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [PrismaModule, OutboxModule, AuditModule, DeliveryAvailabilityModule, MetricsModule],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
