import { Module } from '@nestjs/common';
import { AdminCustomersController } from './admin-customers.controller';
import { AdminCustomersService } from './admin-customers.service';

@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService],
  // Reused by AccountingModule's import-as-new-customer action — it's
  // exactly the org+trade-relationship creation Phase 2 import needs.
  exports: [AdminCustomersService],
})
export class AdminCustomersModule {}
