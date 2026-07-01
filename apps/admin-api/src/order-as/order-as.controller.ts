import { Controller, ForbiddenException, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderAsService } from './order-as.service';

interface RequestWithUser {
  user: { sub: string; organisationId: string; role: string; token: string };
}

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
    if (req.user.role !== 'DISTRIBUTOR_ADMIN') {
      throw new ForbiddenException('Only distributor admins can order on behalf of customers');
    }
    return this.orderAsService.createSession(
      req.user.organisationId,
      tradeRelationshipId,
      req.user.token,
    );
  }
}
