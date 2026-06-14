import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import { AdminProductTypesController } from './admin-product-types.controller';
import { AdminProductTypesService } from './admin-product-types.service';
import { AdminSuppliersController } from './admin-suppliers.controller';
import { AdminSuppliersService } from './admin-suppliers.service';

@Module({
  controllers: [AdminProductsController, AdminProductTypesController, AdminSuppliersController],
  providers: [AdminProductsService, AdminProductTypesService, AdminSuppliersService],
})
export class AdminProductsModule {}
