import {
  Controller, Get, Post, Patch, Delete, Put,
  Param, Body, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import {
  ApiParam, ApiTags, ApiOperation, ApiBearerAuth,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AdminCataloguesService } from './admin-catalogues.service';
import { CreateAdminCatalogueDto } from './dto/create-admin-catalogue.dto';
import { UpdateAdminCatalogueDto } from './dto/update-admin-catalogue.dto';
import { SyncProductsDto } from './dto/sync-products.dto';
import { AdminCatalogueQueryDto } from './dto/catalogue-query.dto';

@ApiTags('Admin / Catalogues')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId')
export class AdminCataloguesController {
  constructor(private service: AdminCataloguesService) {}

  @Get('catalogues')
  @ApiOperation({ summary: 'List catalogues for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of catalogues' })
  findAll(@Param('distributorId') distributorId: string, @Query() query: AdminCatalogueQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Post('catalogues')
  @ApiOperation({ summary: 'Create a catalogue' })
  @ApiCreatedResponse({ description: 'Catalogue created' })
  create(@Param('distributorId') distributorId: string, @Body() dto: CreateAdminCatalogueDto) {
    return this.service.create(distributorId, dto);
  }

  @Get('catalogues/:id')
  @ApiOperation({ summary: 'Get a single catalogue' })
  @ApiOkResponse({ description: 'Catalogue detail' })
  @ApiNotFoundResponse({ description: 'Catalogue not found' })
  findOne(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Patch('catalogues/:id')
  @ApiOperation({ summary: 'Update a catalogue' })
  @ApiOkResponse({ description: 'Catalogue updated' })
  @ApiNotFoundResponse({ description: 'Catalogue not found' })
  update(@Param('distributorId') distributorId: string, @Param('id') id: string, @Body() dto: UpdateAdminCatalogueDto) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('catalogues/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a catalogue' })
  @ApiNoContentResponse({ description: 'Catalogue deleted' })
  @ApiNotFoundResponse({ description: 'Catalogue not found' })
  remove(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }

  @Put('catalogues/:id/products')
  @ApiOperation({ summary: 'Replace the product list for a catalogue' })
  @ApiOkResponse({ description: 'Product list synced' })
  syncProducts(@Param('distributorId') distributorId: string, @Param('id') id: string, @Body() dto: SyncProductsDto) {
    return this.service.syncProducts(id, distributorId, dto);
  }

  // ── Customer catalogue assignment ────────────────────────────────────────────

  @Get('trade-relationships/:trId/catalogues')
  @ApiOperation({ summary: 'Get catalogues assigned to a trade relationship' })
  @ApiOkResponse({ description: 'List of assigned catalogues' })
  getCustomerCatalogues(@Param('distributorId') distributorId: string, @Param('trId') trId: string) {
    return this.service.getCustomerCatalogues(trId, distributorId);
  }

  @Post('trade-relationships/:trId/catalogues/:catId')
  @ApiOperation({ summary: 'Assign a catalogue to a trade relationship' })
  @ApiCreatedResponse({ description: 'Catalogue assigned' })
  assignCatalogue(
    @Param('distributorId') distributorId: string,
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
    @Param('distributorId') distributorId: string,
    @Param('trId') trId: string,
    @Param('catId') catId: string,
  ) {
    return this.service.unassignCatalogue(trId, distributorId, catId);
  }
}
