import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetricsModule } from '@wholo/nest-telemetry';
import { ApiClientModule } from './api-client/api-client.module';
import { DeliveryLinksModule } from './delivery-links/delivery-links.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MetricsModule.forRoot(),
    ApiClientModule,
    DeliveryLinksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
