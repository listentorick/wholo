import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get(':slug')
  getDistributor(@Param('slug') slug: string) {
    return this.catalogueService.getDistributor(slug);
  }

  @Get(':slug/products')
  getProducts(@Param('slug') slug: string, @Query() query: CatalogueQueryDto) {
    return this.catalogueService.getProducts(slug, query);
  }
}
