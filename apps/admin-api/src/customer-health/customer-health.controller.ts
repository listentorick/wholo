import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerHealthService } from './customer-health.service';

// The BFF adapts "the signed-in user's distributor" into the explicit
// distributor-addressed call apps/api serves; apps/api enforces the
// analytics:read permission on every request.
@Controller()
@UseGuards(JwtAuthGuard)
export class CustomerHealthController {
  constructor(private readonly service: CustomerHealthService) {}

  @Get('customer-health')
  getHealth(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.getHealth(organisationId, token);
  }
}
