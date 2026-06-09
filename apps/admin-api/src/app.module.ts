import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductTypesModule } from './product-types/product-types.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ProductsModule } from './products/products.module';
import { CustomersModule } from './customers/customers.module';
import { CataloguesModule } from './catalogues/catalogues.module';
import { ApiClientModule } from './api-client/api-client.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ApiClientModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    ProductTypesModule,
    SuppliersModule,
    ProductsModule,
    CustomersModule,
    CataloguesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
