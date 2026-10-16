import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OrderCompletionModule } from '../orders/order-completion.module';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryLinkGuard } from './delivery-link.guard';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryPhotoService } from './delivery-photo.service';
import { DeliveryLinkTokensService } from './delivery-link-tokens.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    OutboxModule,
    OrderCompletionModule,
    // Scoped to this controller only — see the class comment on
    // DeliveryLinksController. Not registered at AppModule level; must never
    // become a global APP_GUARD, which would rate-limit every route in
    // apps/api rather than just this deliberately-public one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [DeliveryLinksController],
  providers: [DeliveryLinksService, DeliveryPhotoService, DeliveryLinkTokensService, DeliveryLinkGuard],
  // Exported so ManifestService (DeliveryRunsModule) can create the token
  // it prints on the manifest — see manifest.service.ts.
  exports: [DeliveryLinkTokensService],
})
export class DeliveryLinksModule {}
