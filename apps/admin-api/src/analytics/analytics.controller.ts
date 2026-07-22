import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { PeriodQueryDto } from './dto/period-query.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('order-summary')
  orderSummary(@Query() query: PeriodQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.orderSummary(organisationId, query, token);
  }

  @Get('order-trend')
  orderTrend(@Query() query: PeriodQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.orderTrend(organisationId, query, token);
  }

  @Get('customer-rankings')
  customerRankings(@Query() query: PeriodQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.customerRankings(organisationId, query, token);
  }

  @Get('product-rankings')
  productRankings(@Query() query: PeriodQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.productRankings(organisationId, query, token);
  }

  @Get('action-items')
  actionItems(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.actionItems(organisationId, token);
  }
}
