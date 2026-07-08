import { Module } from '@nestjs/common';
import { AccountingConnectionController } from './accounting-connection.controller';
import { XeroCallbackController } from './xero-callback.controller';
import { AccountingConnectionService } from './accounting-connection.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { XeroAccountingAdapter } from './adapters/xero-connection.adapter';

@Module({
  controllers: [AccountingConnectionController, XeroCallbackController],
  providers: [
    AccountingConnectionService,
    TokenEncryptionService,
    AccountingAdapterRegistry,
    XeroAccountingAdapter,
  ],
  // AccountingConnectionService is also used by WorkerModule's dormancy-
  // prevention scheduler — its other dependencies here don't need exporting,
  // Nest resolves them from this module's own container.
  exports: [AccountingConnectionService],
})
export class AccountingModule {}
