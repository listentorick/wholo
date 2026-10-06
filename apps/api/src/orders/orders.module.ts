import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymentTermsModule } from '../payment-terms/payment-terms.module';
import { AuditModule } from '../audit/audit.module';
import { DeliveryAvailabilityModule } from '../delivery-availability/delivery-availability.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

// MetricsService comes from the @Global MetricsModule registered in AppModule /
// WorkerModule (@wholo/nest-telemetry) — no local import needed.
@Module({
  imports: [PrismaModule, OutboxModule, AuditModule, DeliveryAvailabilityModule, PaymentTermsModule],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
