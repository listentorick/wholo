import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import {
  ApiParam, ApiTags, ApiOperation, ApiBearerAuth,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AdminProductsService } from './admin-products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@ApiTags('Admin / Products')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId')
export class AdminProductsController {
  constructor(private service: AdminProductsService) {}

  @Get('products')
  @ApiOperation({ summary: 'List products for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of products' })
  findAll(@Param('distributorId') distributorId: string, @Query() query: ProductQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get a single product' })
  @ApiOkResponse({ description: 'Product detail' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findOne(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiCreatedResponse({ description: 'Product created' })
  create(@Param('distributorId') distributorId: string, @Body() dto: CreateProductDto) {
    return this.service.create(distributorId, dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ description: 'Product updated' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  update(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiNoContentResponse({ description: 'Product deleted' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  remove(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }
}
