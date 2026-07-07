import { Module } from '@nestjs/common';
import { ProductSearchService } from './product-search.service';

@Module({
  providers: [ProductSearchService],
  exports: [ProductSearchService],
})
export class ProductSearchModule {}
