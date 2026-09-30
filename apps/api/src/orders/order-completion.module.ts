import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OrderCompletionService } from './order-completion.service';

// Kept separate from OrdersModule so the accounting and delivery modules can
// share it without importing each other.
@Module({
  imports: [AuditModule, OutboxModule],
  providers: [OrderCompletionService],
  exports: [OrderCompletionService],
})
export class OrderCompletionModule {}
