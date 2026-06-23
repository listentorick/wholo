import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiClientModule } from './api-client/api-client.module';
import { AuthModule } from './auth/auth.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { DeliveryModule } from './delivery/delivery.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PortalModule } from './portal/portal.module';
import { HealthController } from './health.controller';
import { OrderAsContextMiddleware } from './common/middleware/order-as-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ApiClientModule,
    AuthModule,
    CatalogueModule,
    CartModule,
    OrdersModule,
    DeliveryModule,
    InvitationsModule,
    PortalModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(OrderAsContextMiddleware).forRoutes('*');
  }
}
