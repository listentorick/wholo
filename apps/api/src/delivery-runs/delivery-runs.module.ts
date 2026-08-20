import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuditModule } from '../audit/audit.module';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryDaysController } from './delivery-days.controller';
import { DeliveryRunsController } from './delivery-runs.controller';

@Module({
  imports: [PrismaModule, OutboxModule, AuditModule],
  controllers: [DeliveryDaysController, DeliveryRunsController],
  providers: [DeliveryRunsService],
  exports: [DeliveryRunsService],
})
export class DeliveryRunsModule {}
