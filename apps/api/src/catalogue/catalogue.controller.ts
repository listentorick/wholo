import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
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
}

@ApiTags('Distributors')
@Controller('distributors/:distributorId/customers/:customerId')
export class CustomerCatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('catalogue')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Browse products in a distributor catalogue with customer-specific pricing' })
  @ApiOkResponse({ description: 'Paginated product list' })
  getProducts(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
    @Query() query: CatalogueQueryDto,
    @ActingCustomerId() actingCustomerId: string,
  ) {
    if (customerId !== actingCustomerId) {
      throw new ForbiddenException('Not authorised for this customer');
    }
    return this.catalogueService.getProducts(distributorId, query, customerId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('catalogue/:productId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single product with customer-specific pricing' })
  @ApiOkResponse({ description: 'Product detail' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getProduct(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
    @Param('productId') productId: string,
    @ActingCustomerId() actingCustomerId: string,
  ) {
    if (customerId !== actingCustomerId) {
      throw new ForbiddenException('Not authorised for this customer');
    }
    return this.catalogueService.getProduct(distributorId, productId, customerId);
  }
}
