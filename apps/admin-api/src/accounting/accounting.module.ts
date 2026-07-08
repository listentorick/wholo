import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { XeroCallbackController } from './xero-callback.controller';
import { AccountingService } from './accounting.service';

@Module({
  controllers: [AccountingController, XeroCallbackController],
  providers: [AccountingService],
})
export class AccountingModule {}
