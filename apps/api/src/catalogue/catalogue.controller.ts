import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { CatalogueService } from './catalogue.service';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get(':slug')
  getDistributor(@Param('slug') slug: string) {
    return this.catalogueService.getDistributor(slug);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':slug/products')
  getProducts(@Req() req: Request, @Param('slug') slug: string, @Query() query: CatalogueQueryDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.catalogueService.getProducts(slug, query, organisationId);
  }
}
