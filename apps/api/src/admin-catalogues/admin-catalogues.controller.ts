import {
  Controller, Get, Post, Patch, Delete, Put,
  Param, Body, Query, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AdminCataloguesService } from './admin-catalogues.service';
import { CreateAdminCatalogueDto } from './dto/create-admin-catalogue.dto';
import { UpdateAdminCatalogueDto } from './dto/update-admin-catalogue.dto';
import { SyncProductsDto } from './dto/sync-products.dto';
import { AdminCatalogueQueryDto } from './dto/catalogue-query.dto';

@Controller('admin')
export class AdminCataloguesController {
  constructor(private service: AdminCataloguesService) {}

  @Get('catalogues')
  findAll(@Headers('x-distributor-id') distributorId: string, @Query() query: AdminCatalogueQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Post('catalogues')
  create(@Headers('x-distributor-id') distributorId: string, @Body() dto: CreateAdminCatalogueDto) {
    return this.service.create(distributorId, dto);
  }

  @Get('catalogues/:id')
  findOne(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Patch('catalogues/:id')
  update(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string, @Body() dto: UpdateAdminCatalogueDto) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('catalogues/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }

  @Put('catalogues/:id/products')
  syncProducts(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string, @Body() dto: SyncProductsDto) {
    return this.service.syncProducts(id, distributorId, dto);
  }

  // ── Customer catalogue assignment ────────────────────────────────────────────

  @Get('trade-relationships/:trId/catalogues')
  getCustomerCatalogues(@Headers('x-distributor-id') distributorId: string, @Param('trId') trId: string) {
    return this.service.getCustomerCatalogues(trId, distributorId);
  }

  @Post('trade-relationships/:trId/catalogues/:catId')
  assignCatalogue(
    @Headers('x-distributor-id') distributorId: string,
    @Param('trId') trId: string,
    @Param('catId') catId: string,
  ) {
    return this.service.assignCatalogue(trId, distributorId, catId);
  }

  @Delete('trade-relationships/:trId/catalogues/:catId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignCatalogue(
    @Headers('x-distributor-id') distributorId: string,
    @Param('trId') trId: string,
    @Param('catId') catId: string,
  ) {
    return this.service.unassignCatalogue(trId, distributorId, catId);
  }
}
