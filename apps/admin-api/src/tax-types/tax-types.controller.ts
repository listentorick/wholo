import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TaxTypesService } from './tax-types.service';
import { CreateTaxTypeDto } from './dto/create-tax-type.dto';
import { UpdateTaxTypeDto } from './dto/update-tax-type.dto';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('tax-types')
export class TaxTypesController {
  constructor(private taxTypesService: TaxTypesService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: TaxTypeQueryDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.taxTypesService.findAll(organisationId, query, token);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateTaxTypeDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.taxTypesService.create(organisationId, dto, token);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.taxTypesService.findOne(organisationId, id, token);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTaxTypeDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.taxTypesService.update(organisationId, id, dto, token);
  }

  @Delete(':id')
  deactivate(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.taxTypesService.deactivate(organisationId, id, token);
  }
}
