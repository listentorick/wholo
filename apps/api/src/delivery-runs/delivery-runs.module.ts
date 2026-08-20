import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuditModule } from '../audit/audit.module';
import { DeliveryRunAllocationModule } from '../delivery-run-allocation/delivery-run-allocation.module';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryDaysController } from './delivery-days.controller';
import { DeliveryRunsController } from './delivery-runs.controller';
import { OrderSchedulingController } from './order-scheduling.controller';

@Module({
  imports: [
    PrismaModule, OutboxModule, AuditModule,
    // Plain (queue-free) module — reuses DeliveryRunAllocationService's
    // findOrCreateRun synchronously from the change-delivery-date action.
    DeliveryRunAllocationModule,
  ],
  controllers: [DeliveryDaysController, DeliveryRunsController, OrderSchedulingController],
  providers: [DeliveryRunsService],
  exports: [DeliveryRunsService],
})
export class DeliveryRunsModule {}
