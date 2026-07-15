import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiClientModule } from './api-client/api-client.module';
import { AuthModule } from './auth/auth.module';
import { ProductTypesModule } from './product-types/product-types.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ProductsModule } from './products/products.module';
import { CustomersModule } from './customers/customers.module';
import { CataloguesModule } from './catalogues/catalogues.module';
import { OrdersModule } from './orders/orders.module';
import { PriceListsModule } from './price-lists/price-lists.module';
import { AssetImagesModule } from './asset-images/asset-images.module';
import { SettingsModule } from './settings/settings.module';
import { DeliveryProfilesModule } from './delivery-profiles/delivery-profiles.module';
import { OrderAsModule } from './order-as/order-as.module';
import { AccountingModule } from './accounting/accounting.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ApiClientModule,
    AuthModule,
    ProductTypesModule,
    SuppliersModule,
    ProductsModule,
    CustomersModule,
    CataloguesModule,
    OrdersModule,
    PriceListsModule,
    AssetImagesModule,
    SettingsModule,
    DeliveryProfilesModule,
    OrderAsModule,
    AccountingModule,
    OnboardingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
