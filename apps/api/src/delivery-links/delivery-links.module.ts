import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DeliveryLinksController } from './delivery-links.controller';
import { DeliveryLinksService } from './delivery-links.service';
import { DeliveryPhotoService } from './delivery-photo.service';
import { DeliveryTokenSigner } from './delivery-token.signer';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    OutboxModule,
    // Scoped to this controller only — see the class comment on
    // DeliveryLinksController. Not registered at AppModule level; must never
    // become a global APP_GUARD, which would rate-limit every route in
    // apps/api rather than just this deliberately-public one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
  ],
  controllers: [DeliveryLinksController],
  providers: [DeliveryLinksService, DeliveryPhotoService, DeliveryTokenSigner],
  // DeliveryTokenSigner is exported so ManifestService (DeliveryRunsModule)
  // can sign the same durable URL it prints on the manifest — see
  // manifest.service.ts.
  exports: [DeliveryTokenSigner],
})
export class DeliveryLinksModule {}
