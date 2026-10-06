import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiParam, ApiTags, ApiOperation,
  ApiOkResponse, ApiCreatedResponse, ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PaymentTermsService } from './payment-terms.service';
import { CreatePaymentTermDto, PaymentTermRuleDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';

// Payment terms are part of a customer's commercial terms, so they share the
// customers permissions rather than adding their own (ADR-075).
@ApiTags('Payment Terms')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@RequirePermissions(Permission.CUSTOMERS_MANAGE)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/payment-terms')
export class PaymentTermsController {
  constructor(private service: PaymentTermsService) {}

  @Get()
  @RequirePermissions(Permission.CUSTOMERS_READ)
  @ApiOperation({ summary: 'List payment terms (the built-in accounting-software term first)' })
  @ApiOkResponse({ description: 'Payment terms and the id of the distributor default' })
  findAll(@Param('distributorId') distributorId: string) {
    return this.service.findAll(distributorId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a payment term' })
  @ApiCreatedResponse({ description: 'Payment term created' })
  create(@Param('distributorId') distributorId: string, @Body() dto: CreatePaymentTermDto) {
    return this.service.create(distributorId, dto);
  }

  // Declared before :id so "preview" is never read as an id.
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Describe a rule and show example due dates, without saving it' })
  @ApiOkResponse({ description: 'Summary and example invoice/due dates' })
  preview(@Param('distributorId') distributorId: string, @Body() dto: PaymentTermRuleDto) {
    return this.service.preview(distributorId, dto);
  }

  @Get(':id')
  @RequirePermissions(Permission.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Get a payment term' })
  @ApiOkResponse({ description: 'Payment term detail' })
  @ApiNotFoundResponse({ description: 'Payment term not found' })
  findOne(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.findOne(id, distributorId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a payment term, or make it the default (isDefault: true)' })
  @ApiOkResponse({ description: 'Payment term updated' })
  @ApiNotFoundResponse({ description: 'Payment term not found' })
  update(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentTermDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a payment term (soft — customers on it move to the default)' })
  @ApiOkResponse({ description: 'Payment term deactivated' })
  @ApiNotFoundResponse({ description: 'Payment term not found' })
  deactivate(@Param('distributorId') distributorId: string, @Param('id') id: string) {
    return this.service.deactivate(id, distributorId);
  }
}
