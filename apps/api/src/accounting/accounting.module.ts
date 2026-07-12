import { Module } from '@nestjs/common';
import { AdminCustomersModule } from '../admin-customers/admin-customers.module';
import { AdminProductsModule } from '../admin-products/admin-products.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AccountingConnectionController } from './accounting-connection.controller';
import { AccountingContactController } from './accounting-contact.controller';
import { AccountingInvoiceExportController } from './accounting-invoice-export.controller';
import { AccountingProductController } from './accounting-product.controller';
import { XeroCallbackController } from './xero-callback.controller';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingContactService } from './accounting-contact.service';
import { AccountingInvoiceExportService } from './accounting-invoice-export.service';
import { AccountingProductService } from './accounting-product.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { XeroAccountingAdapter } from './adapters/xero-connection.adapter';
import { AccountingContactMatcherService } from './matching/accounting-contact-matcher.service';
import { AccountingProductMatcherService } from './matching/accounting-product-matcher.service';

@Module({
  imports: [AdminCustomersModule, AdminProductsModule, OutboxModule],
  controllers: [
    AccountingConnectionController,
    AccountingContactController,
    AccountingInvoiceExportController,
    AccountingProductController,
    XeroCallbackController,
  ],
  providers: [
    AccountingConnectionService,
    AccountingContactService,
    AccountingInvoiceExportService,
    AccountingProductService,
    TokenEncryptionService,
    AccountingAdapterRegistry,
    XeroAccountingAdapter,
    AccountingContactMatcherService,
    AccountingProductMatcherService,
  ],
  // AccountingConnectionService is used by WorkerModule's dormancy-prevention
  // scheduler; AccountingAdapterRegistry and the matcher services are used by
  // the worker-side sync processors (AccountingContactSyncModule /
  // AccountingProductSyncModule).
  exports: [
    AccountingConnectionService,
    AccountingAdapterRegistry,
    AccountingContactMatcherService,
    AccountingProductMatcherService,
  ],
})
export class AccountingModule {}
