import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DeliveryOverviewService } from './delivery-overview.service';

// Both permissions are required (PermissionsGuard demands all): the read spans
// orders and deliveries, so it is open to whoever can see both — Warehouse
// staff, Operations manager and Owner — without needing analytics:read.
@ApiTags('Delivery Overview')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@RequirePermissions(Permission.ORDERS_READ, Permission.DELIVERY_READ)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/delivery-overview')
export class DeliveryOverviewController {
  constructor(private readonly service: DeliveryOverviewService) {}

  @Get()
  @ApiOperation({ summary: 'Live snapshot for the Delivery dashboard: attention counts, progress, runs and the work queue' })
  @ApiOkResponse({ description: 'DeliveryOverview' })
  overview(@Param('distributorId') distributorId: string) {
    return this.service.getOverview(distributorId);
  }
}
