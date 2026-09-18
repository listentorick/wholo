import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryDayQueryDto } from './dto/delivery-day-query.dto';

// Coarse read resource for the Delivery Runs board. Kept as its own
// controller rather than nested under delivery-runs/: a day's board isn't
// addressed by a run id, so it doesn't fit that resource's path shape.
@ApiTags('Delivery Days')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@RequirePermissions(Permission.DELIVERY_READ)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/delivery-days')
export class DeliveryDaysController {
  constructor(private service: DeliveryRunsService) {}

  @Get()
  @ApiOperation({ summary: 'List per-day workload counts across a bounded date window' })
  listDays(
    @Param('distributorId') distributorId: string,
    @Query() query: DeliveryDayQueryDto,
  ) {
    return this.service.listDays(distributorId, query.from, query.to);
  }

  @Get(':date')
  @ApiOperation({ summary: 'Get the full delivery runs board for one day' })
  getDay(
    @Param('distributorId') distributorId: string,
    @Param('date') date: string,
  ) {
    return this.service.getDay(distributorId, date);
  }
}
