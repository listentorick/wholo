import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiHeader, ApiTags, ApiOperation,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AdminProductsService } from './admin-products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@ApiTags('Admin / Products')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin')
export class AdminProductsController {
  constructor(private service: AdminProductsService) {}

  @Get('products')
  @ApiOperation({ summary: 'List products for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of products' })
  findAll(@Headers('x-distributor-id') distributorId: string, @Query() query: ProductQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get a single product' })
  @ApiOkResponse({ description: 'Product detail' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findOne(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiCreatedResponse({ description: 'Product created' })
  create(@Headers('x-distributor-id') distributorId: string, @Body() dto: CreateProductDto) {
    return this.service.create(distributorId, dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ description: 'Product updated' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  update(
    @Headers('x-distributor-id') distributorId: string,
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
  remove(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }
}
