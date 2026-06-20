import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import {
  ApiBearerAuth, ApiTags, ApiOperation,
  ApiOkResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { CatalogueService } from './catalogue.service';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';
import { ORDER_AS_CONTEXT_KEY, OrderAsContext } from '../order-as/order-as.interceptor';

@ApiTags('Distributors')
@Controller('distributors')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get distributor details by slug' })
  @ApiOkResponse({ description: 'Distributor profile' })
  @ApiNotFoundResponse({ description: 'Distributor not found' })
  getDistributor(@Param('slug') slug: string) {
    return this.catalogueService.getDistributor(slug);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':slug/products')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Browse products in a distributor catalogue with customer-specific pricing' })
  @ApiOkResponse({ description: 'Paginated product list' })
  getProducts(@Req() req: Request, @Param('slug') slug: string, @Query() query: CatalogueQueryDto) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const organisationId = orderAs?.customerId ?? (req.user as { organisationId: string }).organisationId;
    return this.catalogueService.getProducts(slug, query, organisationId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':slug/products/:productId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single product with customer-specific pricing' })
  @ApiOkResponse({ description: 'Product detail' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getProduct(@Req() req: Request, @Param('slug') slug: string, @Param('productId') productId: string) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const organisationId = orderAs?.customerId ?? (req.user as { organisationId: string }).organisationId;
    return this.catalogueService.getProduct(slug, productId, organisationId);
  }
}
