import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerOrderingService } from './customer-ordering.service';

// The BFF adapts "the signed-in user's distributor" into the explicit
// distributor-addressed call apps/api serves; apps/api enforces the
// analytics:read permission and that the customer is this distributor's.
@Controller()
@UseGuards(JwtAuthGuard)
export class CustomerOrderingController {
  constructor(private readonly service: CustomerOrderingService) {}

  @Get('customers/:customerId/ordering-behaviour')
  getBehaviour(@Req() req: Request, @Param('customerId') customerId: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.getBehaviour(organisationId, customerId, token);
  }
}
