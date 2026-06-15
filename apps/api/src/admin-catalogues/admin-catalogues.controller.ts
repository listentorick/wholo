import {
  Controller, Get, Post, Patch, Delete, Put,
  Param, Body, Query, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiHeader, ApiTags, ApiOperation,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AdminCataloguesService } from './admin-catalogues.service';
import { CreateAdminCatalogueDto } from './dto/create-admin-catalogue.dto';
import { UpdateAdminCatalogueDto } from './dto/update-admin-catalogue.dto';
import { SyncProductsDto } from './dto/sync-products.dto';
import { AdminCatalogueQueryDto } from './dto/catalogue-query.dto';

@ApiTags('Admin / Catalogues')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin')
export class AdminCataloguesController {
  constructor(private service: AdminCataloguesService) {}

  @Get('catalogues')
  @ApiOperation({ summary: 'List catalogues for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of catalogues' })
  findAll(@Headers('x-distributor-id') distributorId: string, @Query() query: AdminCatalogueQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Post('catalogues')
  @ApiOperation({ summary: 'Create a catalogue' })
  @ApiCreatedResponse({ description: 'Catalogue created' })
  create(@Headers('x-distributor-id') distributorId: string, @Body() dto: CreateAdminCatalogueDto) {
    return this.service.create(distributorId, dto);
  }

  @Get('catalogues/:id')
  @ApiOperation({ summary: 'Get a single catalogue' })
  @ApiOkResponse({ description: 'Catalogue detail' })
  @ApiNotFoundResponse({ description: 'Catalogue not found' })
  findOne(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Patch('catalogues/:id')
  @ApiOperation({ summary: 'Update a catalogue' })
  @ApiOkResponse({ description: 'Catalogue updated' })
  @ApiNotFoundResponse({ description: 'Catalogue not found' })
  update(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string, @Body() dto: UpdateAdminCatalogueDto) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('catalogues/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a catalogue' })
  @ApiNoContentResponse({ description: 'Catalogue deleted' })
  @ApiNotFoundResponse({ description: 'Catalogue not found' })
  remove(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }

  @Put('catalogues/:id/products')
  @ApiOperation({ summary: 'Replace the product list for a catalogue' })
  @ApiOkResponse({ description: 'Product list synced' })
  syncProducts(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string, @Body() dto: SyncProductsDto) {
    return this.service.syncProducts(id, distributorId, dto);
  }

  // ── Customer catalogue assignment ────────────────────────────────────────────

  @Get('trade-relationships/:trId/catalogues')
  @ApiOperation({ summary: 'Get catalogues assigned to a trade relationship' })
  @ApiOkResponse({ description: 'List of assigned catalogues' })
  getCustomerCatalogues(@Headers('x-distributor-id') distributorId: string, @Param('trId') trId: string) {
    return this.service.getCustomerCatalogues(trId, distributorId);
  }

  @Post('trade-relationships/:trId/catalogues/:catId')
  @ApiOperation({ summary: 'Assign a catalogue to a trade relationship' })
  @ApiCreatedResponse({ description: 'Catalogue assigned' })
  assignCatalogue(
    @Headers('x-distributor-id') distributorId: string,
    @Param('trId') trId: string,
    @Param('catId') catId: string,
  ) {
    return this.service.assignCatalogue(trId, distributorId, catId);
  }

  @Delete('trade-relationships/:trId/catalogues/:catId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unassign a catalogue from a trade relationship' })
  @ApiNoContentResponse({ description: 'Catalogue unassigned' })
  unassignCatalogue(
    @Headers('x-distributor-id') distributorId: string,
    @Param('trId') trId: string,
    @Param('catId') catId: string,
  ) {
    return this.service.unassignCatalogue(trId, distributorId, catId);
  }
}
