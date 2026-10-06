import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentTermsService } from './payment-terms.service';
import { CreatePaymentTermDto, PaymentTermRuleDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';

@UseGuards(JwtAuthGuard)
@Controller('payment-terms')
export class PaymentTermsController {
  constructor(private paymentTermsService: PaymentTermsService) {}

  @Get()
  findAll(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.paymentTermsService.findAll(organisationId, token);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreatePaymentTermDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.paymentTermsService.create(organisationId, dto, token);
  }

  // Declared before :id so "preview" is never read as an id.
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Req() req: Request, @Body() dto: PaymentTermRuleDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.paymentTermsService.preview(organisationId, dto, token);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.paymentTermsService.findOne(organisationId, id, token);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePaymentTermDto) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.paymentTermsService.update(organisationId, id, dto, token);
  }

  @Delete(':id')
  deactivate(@Req() req: Request, @Param('id') id: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.paymentTermsService.deactivate(organisationId, id, token);
  }
}
