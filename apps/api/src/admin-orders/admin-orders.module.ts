import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymentTermsModule } from '../payment-terms/payment-terms.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [OutboxModule, AuditModule, PaymentTermsModule],
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService],
})
export class AdminOrdersModule {}
