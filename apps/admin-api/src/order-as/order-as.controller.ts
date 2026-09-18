import { Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderAsService } from './order-as.service';

interface RequestWithUser {
  user: { sub: string; organisationId: string; token: string };
}

// Authorization (only a DISTRIBUTOR_ADMIN may initiate order-as) is enforced
// by apps/api's OrderAsAdminController via PermissionsGuard — admin-api is a
// BFF and must not re-implement it (ADR-026). This just forwards the call.
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class OrderAsController {
  constructor(private readonly orderAsService: OrderAsService) {}

  @Post(':id/order-as')
  @HttpCode(200)
  orderAs(
    @Req() req: Request & RequestWithUser,
    @Param('id') tradeRelationshipId: string,
  ) {
    return this.orderAsService.createSession(
      req.user.organisationId,
      tradeRelationshipId,
      req.user.token,
    );
  }
}
