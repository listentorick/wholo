import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AdminDeliveryProfilesService } from './admin-delivery-profiles.service';
import { CreateDeliveryProfileDto } from './dto/create-delivery-profile.dto';
import { UpdateDeliveryProfileDto } from './dto/update-delivery-profile.dto';
import { CreateCutoffRuleDto } from './dto/create-cutoff-rule.dto';
import { UpdateCutoffRuleDto } from './dto/update-cutoff-rule.dto';
import { AssignDeliveryProfileDto } from './dto/assign-delivery-profile.dto';
import { DeliveryProfileQueryDto } from './dto/delivery-profile-query.dto';

@ApiTags('Admin / Delivery Profiles')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId')
export class AdminDeliveryProfilesController {
  constructor(private service: AdminDeliveryProfilesService) {}

  // ── Delivery Profiles ────────────────────────────────────────────────────────

  @Get('delivery-profiles')
  @ApiOperation({ summary: 'List delivery profiles for a distributor' })
  findAll(
    @Param('distributorId') distributorId: string,
    @Query() query: DeliveryProfileQueryDto,
  ) {
    return this.service.findAll(distributorId, query);
  }

  @Post('delivery-profiles')
  @ApiOperation({ summary: 'Create a delivery profile' })
  create(
    @Param('distributorId') distributorId: string,
    @Body() dto: CreateDeliveryProfileDto,
  ) {
    return this.service.create(distributorId, dto);
  }

  @Get('delivery-profiles/:id')
  @ApiOperation({ summary: 'Get a delivery profile with its cutoff rules' })
  findOne(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(id, distributorId);
  }

  @Patch('delivery-profiles/:id')
  @ApiOperation({ summary: 'Update a delivery profile' })
  update(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryProfileDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('delivery-profiles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete (deactivate) a delivery profile' })
  remove(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(id, distributorId);
  }

  // ── Cutoff Rules ─────────────────────────────────────────────────────────────

  @Get('delivery-profiles/:id/cutoff-rules')
  @ApiOperation({ summary: 'List cutoff rules for a delivery profile' })
  listCutoffRules(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.listCutoffRules(id, distributorId);
  }

  @Post('delivery-profiles/:id/cutoff-rules')
  @ApiOperation({ summary: 'Create a cutoff rule for a delivery profile' })
  createCutoffRule(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: CreateCutoffRuleDto,
  ) {
    return this.service.createCutoffRule(id, distributorId, dto);
  }

  @Patch('delivery-profiles/:id/cutoff-rules/:ruleId')
  @ApiOperation({ summary: 'Update a cutoff rule' })
  updateCutoffRule(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateCutoffRuleDto,
  ) {
    return this.service.updateCutoffRule(id, ruleId, distributorId, dto);
  }

  @Delete('delivery-profiles/:id/cutoff-rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a cutoff rule' })
  removeCutoffRule(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.service.removeCutoffRule(id, ruleId, distributorId);
  }

  // ── Customer assignment ───────────────────────────────────────────────────────

  @Patch('trade-relationships/:trId/delivery-profile')
  @ApiOperation({ summary: 'Assign or clear the delivery profile for a trade relationship' })
  assignDeliveryProfile(
    @Param('distributorId') distributorId: string,
    @Param('trId') trId: string,
    @Body() dto: AssignDeliveryProfileDto,
  ) {
    return this.service.assignDeliveryProfile(trId, distributorId, dto);
  }
}
