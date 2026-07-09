import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import { AdminProductTypesController } from './admin-product-types.controller';
import { AdminProductTypesService } from './admin-product-types.service';
import { AdminSuppliersController } from './admin-suppliers.controller';
import { AdminSuppliersService } from './admin-suppliers.service';
import { ProductSearchModule } from '../product-search/product-search.module';

@Module({
  imports: [ProductSearchModule],
  controllers: [AdminProductsController, AdminProductTypesController, AdminSuppliersController],
  providers: [AdminProductsService, AdminProductTypesService, AdminSuppliersService],
  // AdminProductsService is reused by AccountingModule's import-as-new-product
  // flow (same pattern as AdminCustomersModule for contacts).
  exports: [AdminProductsService],
})
export class AdminProductsModule {}
