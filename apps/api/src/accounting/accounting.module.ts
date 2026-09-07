import { Module } from '@nestjs/common';
import { AdminCustomersModule } from '../admin-customers/admin-customers.module';
import { AdminProductsModule } from '../admin-products/admin-products.module';
import { TaxTypesModule } from '../tax-types/tax-types.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IngestionRunModule } from '../ingestion/ingestion-run.module';
import { AuditModule } from '../audit/audit.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { AccountingConnectionController } from './accounting-connection.controller';
import { AccountingContactController } from './accounting-contact.controller';
import { AccountingInvoiceExportController } from './accounting-invoice-export.controller';
import { AccountingProductController } from './accounting-product.controller';
import { AccountingTaxTypeController } from './accounting-tax-type.controller';
import { XeroCallbackController } from './xero-callback.controller';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingSyncService } from './sync/accounting-sync.service';
import { AccountingRefreshLockService } from './accounting-refresh-lock.service';
import { AccountingContactService } from './accounting-contact.service';
import { AccountingInvoiceExportService } from './accounting-invoice-export.service';
import { AccountingProductService } from './accounting-product.service';
import { AccountingTaxTypeService } from './accounting-tax-type.service';
import { AccountingChangeDetectionService } from './accounting-change-detection.service';
import { TokenEncryptionService } from './token-encryption.service';
import { AccountingAdapterRegistry } from './adapters/accounting-adapter.registry';
import { XeroAccountingAdapter } from './adapters/xero-connection.adapter';
import { AccountingContactMatcherService } from './matching/accounting-contact-matcher.service';
import { AccountingProductMatcherService } from './matching/accounting-product-matcher.service';
import { AccountingTaxTypeMatcherService } from './matching/accounting-tax-type-matcher.service';

@Module({
  imports: [
    AdminCustomersModule,
    AdminProductsModule,
    TaxTypesModule,
    OutboxModule,
    IngestionRunModule,
    AuditModule,
    AdminNotificationsModule,
  ],
  controllers: [
    AccountingConnectionController,
    AccountingContactController,
    AccountingInvoiceExportController,
    AccountingProductController,
    AccountingTaxTypeController,
    XeroCallbackController,
  ],
  providers: [
    AccountingConnectionService,
    AccountingSyncService,
    AccountingRefreshLockService,
    AccountingContactService,
    AccountingInvoiceExportService,
    AccountingProductService,
    AccountingTaxTypeService,
    AccountingChangeDetectionService,
    TokenEncryptionService,
    AccountingAdapterRegistry,
    XeroAccountingAdapter,
    AccountingContactMatcherService,
    AccountingProductMatcherService,
    AccountingTaxTypeMatcherService,
  ],
  // AccountingConnectionService is used by WorkerModule's dormancy-prevention
  // scheduler; AccountingAdapterRegistry, AccountingChangeDetectionService and
  // the matcher services are used by the worker-side sync processors
  // (AccountingContactSyncModule / AccountingProductSyncModule /
  // AccountingTaxTypeSyncModule). AccountingContactService/AccountingProductService
  // are used by AccountingBulkImportProcessor (AccountingBulkImportModule) to
  // reuse the same per-item import/match logic the row actions use.
  exports: [
    // Re-exported so the worker-side sync processor modules (which import
    // AccountingModule) can inject IngestionRunService.
    IngestionRunModule,
    AccountingConnectionService,
    AccountingSyncService,
    AccountingContactService,
    AccountingProductService,
    AccountingTaxTypeService,
    AccountingAdapterRegistry,
    AccountingChangeDetectionService,
    AccountingContactMatcherService,
    AccountingProductMatcherService,
    AccountingTaxTypeMatcherService,
  ],
})
export class AccountingModule {}
