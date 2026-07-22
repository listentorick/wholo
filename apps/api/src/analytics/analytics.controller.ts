import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AnalyticsService } from './analytics.service';
import { PeriodQueryDto } from './dto/period-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('order-summary')
  @ApiOperation({ summary: 'Order value, count, average order value and purchasing customers for a period' })
  @ApiOkResponse({ description: 'Order summary with period-on-period comparison' })
  orderSummary(@Param('distributorId') distributorId: string, @Query() query: PeriodQueryDto) {
    return this.service.orderSummary(distributorId, query);
  }

  @Get('order-trend')
  @ApiOperation({ summary: 'Day-by-day order value/count series for a period, with the comparison series' })
  @ApiOkResponse({ description: 'Order trend series' })
  orderTrend(@Param('distributorId') distributorId: string, @Query() query: PeriodQueryDto) {
    return this.service.orderTrend(distributorId, query);
  }

  @Get('customer-rankings')
  @ApiOperation({ summary: 'Top customers by qualifying order value for a period' })
  @ApiOkResponse({ description: 'Ranked customers with share and period-on-period change' })
  customerRankings(@Param('distributorId') distributorId: string, @Query() query: PeriodQueryDto) {
    return this.service.customerRankings(distributorId, query);
  }

  @Get('product-rankings')
  @ApiOperation({ summary: 'Top products by sales value/units/customer reach for a period' })
  @ApiOkResponse({ description: 'Ranked products, plus enabled non-selling products' })
  productRankings(@Param('distributorId') distributorId: string, @Query() query: PeriodQueryDto) {
    return this.service.productRankings(distributorId, query);
  }

  @Get('action-items')
  @ApiOperation({ summary: 'Current operational exceptions needing attention (not period-filtered)' })
  @ApiOkResponse({ description: 'Orders awaiting acceptance/fulfilment, invoice failures, customers who never ordered' })
  actionItems(@Param('distributorId') distributorId: string) {
    return this.service.actionItems(distributorId);
  }
}
