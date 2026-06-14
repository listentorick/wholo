import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductsService } from './products.service';
import { ApiClientService } from '../api-client/api-client.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private api: ApiClientService,
  ) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: ProductQueryDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.productsService.findAll(organisationId, query);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.productsService.findOne(id, organisationId);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateProductDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.productsService.create(organisationId, dto);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.productsService.update(id, organisationId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.productsService.remove(id, organisationId);
  }

  @Get(':id/pricing')
  getProductPricing(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.api.get(`/admin/products/${id}/pricing`, organisationId);
  }
}
