import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryOverviewService } from './delivery-overview.service';
import { DeliveryOutcomesQueryDto } from './dto/delivery-outcomes-query.dto';

// The BFF adapts "the signed-in user's distributor" into the explicit
// distributor-addressed calls apps/api serves; apps/api enforces the permission
// (orders:read + delivery:read) on every request.
@Controller()
@UseGuards(JwtAuthGuard)
export class DeliveryOverviewController {
  constructor(private readonly service: DeliveryOverviewService) {}

  @Get('delivery-overview')
  overview(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.overview(organisationId, token);
  }

  @Get('delivery-outcomes')
  outcomes(@Query() query: DeliveryOutcomesQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.outcomes(organisationId, query.from, query.to, token);
  }
}
