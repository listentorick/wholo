import {
  Body, Controller, Get, Param, Patch, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DeliveryRunsService } from './delivery-runs.service';
import { ReschedulePreviewQueryDto } from './dto/reschedule-preview-query.dto';
import { ChangeScheduledDeliveryDateDto } from './dto/change-scheduled-delivery-date.dto';

interface RequestWithUser extends Request {
  user: { sub: string };
}

// Order-scoped, not run-scoped: this action addresses the order and resolves
// its destination run as a side effect. scheduled-delivery-date earns its own
// path segment rather than a generic order-field PATCH (which doesn't exist
// here — admin-orders/ is legacy admin/-prefixed debt this feature
// deliberately doesn't extend) because it's a distinct action (synchronous
// re-resolution + drift/nearby surfacing), not a plain field update.
@ApiTags('Delivery Runs')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/orders')
export class OrderSchedulingController {
  constructor(private service: DeliveryRunsService) {}

  @Get(':orderId/reschedule-preview')
  @RequirePermissions(Permission.DELIVERY_READ)
  @ApiOperation({ summary: 'Preview route/run resolution and nearby same-address deliveries for a candidate date' })
  getReschedulePreview(
    @Param('distributorId') distributorId: string,
    @Param('orderId') orderId: string,
    @Query() query: ReschedulePreviewQueryDto,
  ) {
    return this.service.getReschedulePreview(distributorId, orderId, query.date);
  }

  @Patch(':orderId/scheduled-delivery-date')
  @RequirePermissions(Permission.DELIVERY_MANAGE)
  @ApiOperation({ summary: 'Change an order\'s scheduled delivery date, re-resolving its route/run synchronously' })
  changeScheduledDeliveryDate(
    @Param('distributorId') distributorId: string,
    @Param('orderId') orderId: string,
    @Body() dto: ChangeScheduledDeliveryDateDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.changeScheduledDeliveryDate(distributorId, orderId, dto, req.user.sub);
  }
}
