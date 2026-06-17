import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryProfilesService } from './delivery-profiles.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-profiles')
export class DeliveryProfilesController {
  constructor(private service: DeliveryProfilesService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: Record<string, string>) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.findAll(organisationId, query);
  }

  @Post()
  create(@Req() req: Request, @Body() body: unknown) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.create(organisationId, body);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.findOne(organisationId, id);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.update(organisationId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.remove(organisationId, id);
  }

  @Get(':id/cutoff-rules')
  listCutoffRules(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.listCutoffRules(organisationId, id);
  }

  @Post(':id/cutoff-rules')
  createCutoffRule(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.createCutoffRule(organisationId, id, body);
  }

  @Patch(':id/cutoff-rules/:ruleId')
  updateCutoffRule(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() body: unknown,
  ) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.updateCutoffRule(organisationId, id, ruleId, body);
  }

  @Delete(':id/cutoff-rules/:ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCutoffRule(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.removeCutoffRule(organisationId, id, ruleId);
  }
}
