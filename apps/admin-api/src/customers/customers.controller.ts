import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: CustomerQueryDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.customersService.findAll(organisationId, query);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.customersService.findOne(id, organisationId);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCustomerDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.customersService.create(organisationId, dto);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.customersService.update(id, organisationId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.customersService.remove(id, organisationId);
  }

  @Post(':id/invite')
  invite(@Req() req: Request, @Param('id') id: string) {
    const { organisationId } = req.user as { organisationId: string };
    return this.customersService.invite(id, organisationId);
  }
}
