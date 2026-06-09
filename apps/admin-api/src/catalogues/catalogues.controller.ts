import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CataloguesService } from './catalogues.service';
import { CreateCatalogueDto } from './dto/create-catalogue.dto';
import { UpdateCatalogueDto } from './dto/update-catalogue.dto';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalogues')
export class CataloguesController {
  constructor(private cataloguesService: CataloguesService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: CatalogueQueryDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.cataloguesService.findAll(organisationId, query);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.cataloguesService.findOne(organisationId, id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCatalogueDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.cataloguesService.create(organisationId, dto);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCatalogueDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.cataloguesService.update(organisationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.cataloguesService.remove(organisationId, id);
  }
}
