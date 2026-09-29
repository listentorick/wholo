import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerPaymentsService } from './customer-payments.service';

// The BFF adapts "the signed-in user's distributor" into the explicit
// distributor-addressed call apps/api serves; apps/api enforces the
// customers:read permission and that the customer is this distributor's.
@Controller()
@UseGuards(JwtAuthGuard)
export class CustomerPaymentsController {
  constructor(private readonly service: CustomerPaymentsService) {}

  @Get('customers/:customerId/payments')
  getSummary(@Req() req: Request, @Param('customerId') customerId: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.getSummary(organisationId, customerId, token);
  }
}
