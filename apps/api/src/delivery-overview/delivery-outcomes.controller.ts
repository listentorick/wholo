import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DeliveryOutcomesService } from './delivery-outcomes.service';
import { DeliveryOutcomesQueryDto } from './dto/delivery-outcomes-query.dto';

// Both permissions are required (PermissionsGuard demands all): the read spans
// orders and deliveries, so it is open to whoever can see both — Warehouse
// staff, Operations manager and Owner — without needing analytics:read.
@ApiTags('Delivery Overview')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@RequirePermissions(Permission.ORDERS_READ, Permission.DELIVERY_READ)
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/delivery-outcomes')
export class DeliveryOutcomesController {
  constructor(private readonly service: DeliveryOutcomesService) {}

  @Get()
  @ApiOperation({ summary: 'Per-day delivery outcomes (on time / late / failed) for a date range, from delivery facts' })
  @ApiOkResponse({ description: 'DeliveryOutcomesResponse' })
  days(@Param('distributorId') distributorId: string, @Query() query: DeliveryOutcomesQueryDto) {
    return this.service.getDays(distributorId, query.from, query.to);
  }
}
