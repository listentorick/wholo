import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth, ApiTags, ApiOperation,
  ApiOkResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { CatalogueService } from './catalogue.service';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';
import { ActingCustomerId } from '../order-as/acting-customer.decorator';

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
  getProducts(
    @Param('slug') slug: string,
    @Query() query: CatalogueQueryDto,
    @ActingCustomerId() organisationId: string,
  ) {
    return this.catalogueService.getProducts(slug, query, organisationId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':slug/products/:productId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single product with customer-specific pricing' })
  @ApiOkResponse({ description: 'Product detail' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getProduct(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
    @ActingCustomerId() organisationId: string,
  ) {
    return this.catalogueService.getProduct(slug, productId, organisationId);
  }
}
