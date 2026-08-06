import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiParam, ApiTags, ApiOperation,
  ApiOkResponse, ApiCreatedResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { TaxTypesService } from './tax-types.service';
import { CreateTaxTypeDto } from './dto/create-tax-type.dto';
import { UpdateTaxTypeDto } from './dto/update-tax-type.dto';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';

// Target resource shape (CLAUDE.md): explicit distributor-scoped resource
// path, not the legacy admin/distributors/:distributorId prefix.
@ApiTags('Tax Types')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId/tax-types')
export class TaxTypesController {
  constructor(private service: TaxTypesService) {}

  @Get()
  @ApiOperation({ summary: 'List tax types for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of tax types' })
  findAll(@Param('distributorId') distributorId: string, @Query() query: TaxTypeQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a tax type' })
  @ApiCreatedResponse({ description: 'Tax type created' })
  create(@Param('distributorId') distributorId: string, @Body() dto: CreateTaxTypeDto) {
    return this.service.create(distributorId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single tax type' })
  @ApiOkResponse({ description: 'Tax type detail' })
  @ApiNotFoundResponse({ description: 'Tax type not found' })
  findOne(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tax type' })
  @ApiOkResponse({ description: 'Tax type updated' })
  @ApiNotFoundResponse({ description: 'Tax type not found' })
  update(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaxTypeDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a tax type (soft — never hard-deleted)' })
  @ApiOkResponse({ description: 'Tax type deactivated' })
  @ApiNotFoundResponse({ description: 'Tax type not found' })
  deactivate(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.deactivate(id, distributorId);
  }
}
