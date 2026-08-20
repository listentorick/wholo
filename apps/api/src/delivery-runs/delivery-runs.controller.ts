import {
  Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { DeliveryRunsService } from './delivery-runs.service';
import { AssignOrderToRunDto } from './dto/assign-order-to-run.dto';
import { ReorderRunOrdersDto } from './dto/reorder-run-orders.dto';
import { UnassignOrderQueryDto } from './dto/unassign-order-query.dto';
import { UpdateDeliveryRunDto } from './dto/update-delivery-run.dto';

interface RequestWithUser extends Request {
  user: { sub: string };
}

@ApiTags('Delivery Runs')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId/delivery-runs')
export class DeliveryRunsController {
  constructor(private service: DeliveryRunsService) {}

  @Post(':runId/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign (or move) an order into a delivery run' })
  assignOrderToRun(
    @Param('distributorId') distributorId: string,
    @Param('runId') runId: string,
    @Body() dto: AssignOrderToRunDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.assignOrderToRun(distributorId, runId, dto, req.user.sub);
  }

  // Deliberately not @HttpCode(NO_CONTENT) — every other DELETE in this
  // codebase returns 204, but this one returns the refreshed
  // DeliveryDayBoard so the client never has to guess new versions, stop
  // numbers, or totals on the success path; a re-GET is only needed on the
  // failure path (see M3 plan §"Mutations — CAS, ordering, versions").
  @Delete(':runId/orders/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an order from a delivery run, back to Unassigned' })
  unassignOrderFromRun(
    @Param('distributorId') distributorId: string,
    @Param('runId') runId: string,
    @Param('orderId') orderId: string,
    @Query() query: UnassignOrderQueryDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.unassignOrderFromRun(distributorId, runId, orderId, query.version, req.user.sub);
  }

  @Patch(':runId/orders/reorder')
  @ApiOperation({ summary: 'Bulk-update a run\'s delivery drop order' })
  reorderRunOrders(
    @Param('distributorId') distributorId: string,
    @Param('runId') runId: string,
    @Body() dto: ReorderRunOrdersDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.reorderRunOrders(distributorId, runId, dto, req.user.sub);
  }

  @Patch(':runId')
  @ApiOperation({ summary: 'Mark a run ready, reopen it, or change its driver override' })
  updateRun(
    @Param('distributorId') distributorId: string,
    @Param('runId') runId: string,
    @Body() dto: UpdateDeliveryRunDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.updateRun(distributorId, runId, dto, req.user.sub);
  }
}
