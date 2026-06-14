import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AdminProductsService } from './admin-products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@Controller('admin')
export class AdminProductsController {
  constructor(private service: AdminProductsService) {}

  @Get('products')
  findAll(@Headers('x-distributor-id') distributorId: string, @Query() query: ProductQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Get('products/:id')
  findOne(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Post('products')
  create(@Headers('x-distributor-id') distributorId: string, @Body() dto: CreateProductDto) {
    return this.service.create(distributorId, dto);
  }

  @Patch('products/:id')
  update(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }
}
