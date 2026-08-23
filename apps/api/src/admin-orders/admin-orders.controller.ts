import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiParam, ApiTags, ApiOperation, ApiBearerAuth,
  ApiOkResponse, ApiNotFoundResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AdminOrdersService } from './admin-orders.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { AcceptOrderDto } from './dto/accept-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

interface RequestWithUser extends Request {
  user: { sub: string };
}

@ApiTags('Admin / Orders')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId')
export class AdminOrdersController {
  constructor(private readonly service: AdminOrdersService) {}

  @Get('orders')
  @ApiOperation({ summary: 'List all orders for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of orders' })
  listOrders(
    @Param('distributorId') distributorId: string,
    @Query() query: OrderQueryDto,
  ) {
    return this.service.listOrders(distributorId, query);
  }

  @Get('orders/needs-attention-count')
  @ApiOperation({ summary: 'Count of orders awaiting acceptance (SUBMITTED)' })
  async countNeedsAttention(@Param('distributorId') distributorId: string) {
    return { count: await this.service.countNeedsAttention(distributorId) };
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get a single order' })
  @ApiOkResponse({ description: 'Order detail' })
  @ApiNotFoundResponse({ description: 'Order not found or belongs to a different distributor' })
  getOrder(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.getOrder(id, distributorId);
  }

  @Get('orders/:id/audit-log')
  @ApiOperation({ summary: "Get an order's audit log (who did what, when)" })
  @ApiOkResponse({ description: 'Paginated audit log entries' })
  @ApiNotFoundResponse({ description: 'Order not found or belongs to a different distributor' })
  getOrderAuditLog(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Query() query: AuditLogQueryDto,
  ) {
    return this.service.getOrderAuditLog(id, distributorId, query);
  }

  @Post('orders/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a submitted order' })
  @ApiOkResponse({ description: 'Order accepted' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiUnprocessableEntityResponse({ description: 'Order is not in SUBMITTED status' })
  acceptOrder(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: AcceptOrderDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.acceptOrder(id, distributorId, req.user.sub, dto.confirmUnmappedTaxTypes);
  }

  @Post('orders/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a submitted order' })
  @ApiOkResponse({ description: 'Order rejected' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiUnprocessableEntityResponse({ description: 'Order is not in SUBMITTED status' })
  rejectOrder(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.rejectOrder(id, distributorId, req.user.sub, dto.reason);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order (SUBMITTED or ACCEPTED)' })
  @ApiOkResponse({ description: 'Order cancelled' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiUnprocessableEntityResponse({ description: 'Order cannot be cancelled in its current state' })
  cancelOrder(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.cancelOrder(id, distributorId, req.user.sub, dto.reason);
  }
}
