import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuditModule } from '../audit/audit.module';
import { DeliveryRunAllocationModule } from '../delivery-run-allocation/delivery-run-allocation.module';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryDaysController } from './delivery-days.controller';
import { DeliveryRunsController } from './delivery-runs.controller';
import { OrderSchedulingController } from './order-scheduling.controller';
import { ManifestDataService } from './manifest/manifest-data.service';
import { ManifestLogoService } from './manifest/logo.service';
import { ManifestService } from './manifest/manifest.service';

@Module({
  imports: [
    PrismaModule, OutboxModule, AuditModule,
    // Plain (queue-free) module — reuses DeliveryRunAllocationService's
    // findOrCreateRun synchronously from the change-delivery-date action.
    DeliveryRunAllocationModule,
    // AssetImagesModule is @Global() (see apps/api/src/asset-images) — its
    // exported R2StorageService/ImageProcessingService are injectable into
    // ManifestLogoService without importing it here.
  ],
  controllers: [DeliveryDaysController, DeliveryRunsController, OrderSchedulingController],
  providers: [DeliveryRunsService, ManifestDataService, ManifestLogoService, ManifestService],
  exports: [DeliveryRunsService],
})
export class DeliveryRunsModule {}
