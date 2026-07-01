import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PriceListsService } from './price-lists.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PriceListQueryDto } from './dto/price-list-query.dto';
import { CreatePriceListRuleDto } from './dto/create-price-list-rule.dto';
import { UpdatePriceListRuleDto } from './dto/update-price-list-rule.dto';

@UseGuards(JwtAuthGuard)
@Controller('price-lists')
export class PriceListsController {
  constructor(private priceListsService: PriceListsService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: PriceListQueryDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.findAll(organisationId, query, token);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreatePriceListDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.create(organisationId, dto, token);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.findOne(organisationId, id, token);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePriceListDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.update(organisationId, id, dto, token);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.remove(organisationId, id, token);
  }

  @Post(':id/set-default')
  setDefault(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.setDefault(organisationId, id, token);
  }

  @Get(':id/rules')
  listRules(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.listRules(organisationId, id, token);
  }

  @Post(':id/rules')
  createRule(@Req() req: Request, @Param('id') id: string, @Body() dto: CreatePriceListRuleDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.createRule(organisationId, id, dto, token);
  }

  @Patch(':id/rules/:ruleId')
  updateRule(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdatePriceListRuleDto,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.updateRule(organisationId, id, ruleId, dto, token);
  }

  @Delete(':id/rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRule(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.priceListsService.removeRule(organisationId, id, ruleId, token);
  }
}
