import { Module } from '@nestjs/common';
import { AdminCustomersModule } from '../admin-customers/admin-customers.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AccountingConnectionController } from './accounting-connection.controller';
import { AccountingContactController } from './accounting-contact.controller';
import { XeroCallbackController } from './xero-callback.controller';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingContactService } from './accounting-contact.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { XeroAccountingAdapter } from './adapters/xero-connection.adapter';
import { AccountingContactMatcherService } from './matching/accounting-contact-matcher.service';

@Module({
  imports: [AdminCustomersModule, OutboxModule],
  controllers: [AccountingConnectionController, AccountingContactController, XeroCallbackController],
  providers: [
    AccountingConnectionService,
    AccountingContactService,
    TokenEncryptionService,
    AccountingAdapterRegistry,
    XeroAccountingAdapter,
    AccountingContactMatcherService,
  ],
  // AccountingConnectionService is used by WorkerModule's dormancy-prevention
  // scheduler; AccountingAdapterRegistry and AccountingContactMatcherService
  // are used by AccountingContactSyncModule's worker-side sync processor.
  exports: [AccountingConnectionService, AccountingAdapterRegistry, AccountingContactMatcherService],
})
export class AccountingModule {}
