import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AdminPriceListsService } from './admin-price-lists.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PriceListQueryDto } from './dto/price-list-query.dto';
import { CreatePriceListRuleDto } from './dto/create-price-list-rule.dto';
import { UpdatePriceListRuleDto } from './dto/update-price-list-rule.dto';
import { AssignPriceListDto } from './dto/assign-price-list.dto';

@Controller('admin')
export class AdminPriceListsController {
  constructor(private service: AdminPriceListsService) {}

  // ── Price Lists ──────────────────────────────────────────────────────────────

  @Get('price-lists')
  findAll(@Headers('x-distributor-id') distributorId: string, @Query() query: PriceListQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Post('price-lists')
  create(@Headers('x-distributor-id') distributorId: string, @Body() dto: CreatePriceListDto) {
    return this.service.create(distributorId, dto);
  }

  @Get('price-lists/:id')
  findOne(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Patch('price-lists/:id')
  update(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePriceListDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('price-lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }

  @Post('price-lists/:id/set-default')
  setDefault(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.setDefault(id, distributorId);
  }

  // ── Rules ────────────────────────────────────────────────────────────────────

  @Get('price-lists/:id/rules')
  listRules(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.listRules(id, distributorId);
  }

  @Post('price-lists/:id/rules')
  createRule(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Body() dto: CreatePriceListRuleDto,
  ) {
    return this.service.createRule(id, distributorId, dto);
  }

  @Patch('price-lists/:id/rules/:ruleId')
  updateRule(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdatePriceListRuleDto,
  ) {
    return this.service.updateRule(id, ruleId, distributorId, dto);
  }

  @Delete('price-lists/:id/rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRule(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.service.removeRule(id, ruleId, distributorId);
  }

  // ── Product cross-pricelist pricing ─────────────────────────────────────────

  @Get('products/:productId/pricing')
  getProductPricing(
    @Headers('x-distributor-id') distributorId: string,
    @Param('productId') productId: string,
  ) {
    return this.service.getPricingForProduct(productId, distributorId);
  }

  // ── Customer assignment ───────────────────────────────────────────────────────

  @Patch('trade-relationships/:trId/price-list')
  assignPriceList(
    @Headers('x-distributor-id') distributorId: string,
    @Param('trId') trId: string,
    @Body() dto: AssignPriceListDto,
  ) {
    return this.service.assignPriceList(trId, distributorId, dto);
  }
}
