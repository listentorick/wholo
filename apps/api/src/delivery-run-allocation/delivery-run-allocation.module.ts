import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuditModule } from '../audit/audit.module';
import { DELIVERY_RUN_ALLOCATION_QUEUE } from '../queues/queue.constants';
import { DeliveryRunAllocationProcessor } from './delivery-run-allocation.processor';
import { DeliveryRunAllocationService } from './delivery-run-allocation.service';

// Worker-only, same as the accounting processors — imported by WorkerModule,
// never AppModule (the HTTP API process has no BullMQ wiring, by deliberate
// rule). The service is exported so the later change-delivery-date action can
// reuse the same allocation logic synchronously from the HTTP side.
@Module({
  imports: [
    BullModule.registerQueue({ name: DELIVERY_RUN_ALLOCATION_QUEUE }),
    PrismaModule,
    OutboxModule,
    AuditModule,
  ],
  providers: [DeliveryRunAllocationProcessor, DeliveryRunAllocationService],
  exports: [DeliveryRunAllocationService],
})
export class DeliveryRunAllocationModule {}
