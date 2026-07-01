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
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.productsService.findAll(organisationId, query, token);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.productsService.findOne(id, organisationId, token);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateProductDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.productsService.create(organisationId, dto, token);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.productsService.update(id, organisationId, dto, token);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.productsService.remove(id, organisationId, token);
  }

  @Get(':id/pricing')
  getProductPricing(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.api.get(`/admin/distributors/${organisationId}/products/${id}/pricing`, token);
  }
}
