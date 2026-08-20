import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuditModule } from '../audit/audit.module';
import { DeliveryRunAllocationService } from './delivery-run-allocation.service';

// Plain, queue-free — importable by both the HTTP-side DeliveryRunsModule
// (the change-delivery-date action reuses this service synchronously, per
// this module's original comment) and by DeliveryRunAllocationWorkerModule,
// which layers the BullMQ queue/processor on top for the worker process.
// Mirrors AccountingModule's own shape (a plain HTTP-side module imported by
// WorkerModule) in the opposite direction.
@Module({
  imports: [PrismaModule, OutboxModule, AuditModule],
  providers: [DeliveryRunAllocationService],
  exports: [DeliveryRunAllocationService],
})
export class DeliveryRunAllocationModule {}
