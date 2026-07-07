import { Module } from '@nestjs/common';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { PriceListsModule } from '../price-lists/price-lists.module';
import { ProductSearchModule } from '../product-search/product-search.module';

@Module({
  imports: [PriceListsModule, ProductSearchModule],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
