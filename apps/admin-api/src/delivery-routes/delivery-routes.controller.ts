import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryRoutesService } from './delivery-routes.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-routes')
export class DeliveryRoutesController {
  constructor(private service: DeliveryRoutesService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: Record<string, string>) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.findAll(organisationId, query, token);
  }

  @Post()
  create(@Req() req: Request, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.create(organisationId, body, token);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.findOne(organisationId, id, token);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.update(organisationId, id, body, token);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.remove(organisationId, id, token);
  }

  @Get(':id/customers')
  listCustomers(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.listCustomers(organisationId, id, token);
  }

  @Post(':id/customers')
  assignCustomer(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.assignCustomer(organisationId, id, body, token);
  }

  @Delete(':id/customers/:customerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCustomer(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('customerId') customerId: string,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.removeCustomer(organisationId, id, customerId, token);
  }

  @Patch(':id/customers/reorder')
  reorderCustomers(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.reorderCustomers(organisationId, id, body, token);
  }
}
