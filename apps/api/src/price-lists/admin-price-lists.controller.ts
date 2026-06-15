import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiHeader, ApiTags, ApiOperation,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AdminPriceListsService } from './admin-price-lists.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PriceListQueryDto } from './dto/price-list-query.dto';
import { CreatePriceListRuleDto } from './dto/create-price-list-rule.dto';
import { UpdatePriceListRuleDto } from './dto/update-price-list-rule.dto';
import { AssignPriceListDto } from './dto/assign-price-list.dto';

@ApiTags('Admin / Price Lists')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin')
export class AdminPriceListsController {
  constructor(private service: AdminPriceListsService) {}

  // ── Price Lists ──────────────────────────────────────────────────────────────

  @Get('price-lists')
  @ApiOperation({ summary: 'List price lists for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of price lists' })
  findAll(@Headers('x-distributor-id') distributorId: string, @Query() query: PriceListQueryDto) {
    return this.service.findAll(distributorId, query);
  }

  @Post('price-lists')
  @ApiOperation({ summary: 'Create a price list' })
  @ApiCreatedResponse({ description: 'Price list created' })
  create(@Headers('x-distributor-id') distributorId: string, @Body() dto: CreatePriceListDto) {
    return this.service.create(distributorId, dto);
  }

  @Get('price-lists/:id')
  @ApiOperation({ summary: 'Get a single price list with its rules' })
  @ApiOkResponse({ description: 'Price list detail' })
  @ApiNotFoundResponse({ description: 'Price list not found' })
  findOne(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Patch('price-lists/:id')
  @ApiOperation({ summary: 'Update a price list' })
  @ApiOkResponse({ description: 'Price list updated' })
  @ApiNotFoundResponse({ description: 'Price list not found' })
  update(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePriceListDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('price-lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a price list' })
  @ApiNoContentResponse({ description: 'Price list deleted' })
  @ApiNotFoundResponse({ description: 'Price list not found' })
  remove(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.remove(id, distributorId);
  }

  @Post('price-lists/:id/set-default')
  @ApiOperation({ summary: 'Set a price list as the distributor default' })
  @ApiOkResponse({ description: 'Default price list updated' })
  @ApiNotFoundResponse({ description: 'Price list not found' })
  setDefault(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.setDefault(id, distributorId);
  }

  // ── Rules ────────────────────────────────────────────────────────────────────

  @Get('price-lists/:id/rules')
  @ApiOperation({ summary: 'List pricing rules for a price list' })
  @ApiOkResponse({ description: 'List of price list rules' })
  listRules(@Headers('x-distributor-id') distributorId: string, @Param('id') id: string) {
    return this.service.listRules(id, distributorId);
  }

  @Post('price-lists/:id/rules')
  @ApiOperation({ summary: 'Create a pricing rule' })
  @ApiCreatedResponse({ description: 'Rule created' })
  createRule(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Body() dto: CreatePriceListRuleDto,
  ) {
    return this.service.createRule(id, distributorId, dto);
  }

  @Patch('price-lists/:id/rules/:ruleId')
  @ApiOperation({ summary: 'Update a pricing rule' })
  @ApiOkResponse({ description: 'Rule updated' })
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
  @ApiOperation({ summary: 'Delete a pricing rule' })
  @ApiNoContentResponse({ description: 'Rule deleted' })
  removeRule(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.service.removeRule(id, ruleId, distributorId);
  }

  // ── Product pricing ──────────────────────────────────────────────────────────

  @Get('products/:productId/pricing')
  @ApiOperation({ summary: 'Get pricing across all price lists for a product' })
  @ApiOkResponse({ description: 'Pricing breakdown per price list' })
  getProductPricing(
    @Headers('x-distributor-id') distributorId: string,
    @Param('productId') productId: string,
  ) {
    return this.service.getPricingForProduct(productId, distributorId);
  }

  // ── Customer assignment ───────────────────────────────────────────────────────

  @Patch('trade-relationships/:trId/price-list')
  @ApiOperation({ summary: 'Assign or clear the price list for a trade relationship' })
  @ApiOkResponse({ description: 'Price list assignment updated' })
  assignPriceList(
    @Headers('x-distributor-id') distributorId: string,
    @Param('trId') trId: string,
    @Body() dto: AssignPriceListDto,
  ) {
    return this.service.assignPriceList(trId, distributorId, dto);
  }
}
