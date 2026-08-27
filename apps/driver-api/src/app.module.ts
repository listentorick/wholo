import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiClientModule } from './api-client/api-client.module';
import { DeliveryLinksModule } from './delivery-links/delivery-links.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ApiClientModule,
    DeliveryLinksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
