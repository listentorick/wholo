import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentTermsController } from './payment-terms.controller';
import { PaymentTermsService } from './payment-terms.service';
import { PaymentTermResolutionService } from './payment-term-resolution.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentTermsController],
  providers: [PaymentTermsService, PaymentTermResolutionService],
  // Orders/AdminOrders snapshot terms at acceptance; AdminCustomers assigns them.
  exports: [PaymentTermsService, PaymentTermResolutionService],
})
export class PaymentTermsModule {}
