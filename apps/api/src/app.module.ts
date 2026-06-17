import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { CartModule } from './cart/cart.module';
import { AdminCataloguesModule } from './admin-catalogues/admin-catalogues.module';
import { OutboxModule } from './outbox/outbox.module';
import { OrdersModule } from './orders/orders.module';
import { PriceListsModule } from './price-lists/price-lists.module';
import { AdminProductsModule } from './admin-products/admin-products.module';
import { AdminOrdersModule } from './admin-orders/admin-orders.module';
import { AdminCustomersModule } from './admin-customers/admin-customers.module';
import { AdminSettingsModule } from './admin-settings/admin-settings.module';
import { AssetImagesModule } from './asset-images/asset-images.module';
import { HealthController } from './health.controller';
import './admin-products/product-image.asset-config';
import './asset-images/branding-asset-types';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AssetImagesModule,
    UsersModule,
    AuthModule,
    CatalogueModule,
    CartModule,
    AdminCataloguesModule,
    OutboxModule,
    OrdersModule,
    PriceListsModule,
    AdminProductsModule,
    AdminOrdersModule,
    AdminCustomersModule,
    AdminSettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
