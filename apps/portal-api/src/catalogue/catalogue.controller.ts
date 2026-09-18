import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CatalogueService } from './catalogue.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: { token: string; organisationId: string };
}

@Controller('distributors')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get(':slug')
  getDistributor(@Param('slug') slug: string) {
    return this.catalogueService.getDistributor(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':slug/products')
  getProducts(
    @Param('slug') slug: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithUser,
  ) {
    const { token, organisationId } = req.user;
    return this.catalogueService.getProducts(slug, query, organisationId, token);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':slug/products/:productId')
  getProduct(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @Req() req: RequestWithUser,
  ) {
    const { token, organisationId } = req.user;
    return this.catalogueService.getProduct(slug, productId, organisationId, token);
  }
}
