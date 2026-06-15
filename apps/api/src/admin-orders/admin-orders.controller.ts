import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiHeader, ApiTags, ApiOperation,
  ApiOkResponse, ApiNotFoundResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AdminOrdersService } from './admin-orders.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@ApiTags('Admin / Orders')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin')
export class AdminOrdersController {
  constructor(private readonly service: AdminOrdersService) {}

  @Get('orders')
  @ApiOperation({ summary: 'List all orders for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of orders' })
  listOrders(
    @Headers('x-distributor-id') distributorId: string,
    @Query() query: OrderQueryDto,
  ) {
    return this.service.listOrders(distributorId, query);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get a single order' })
  @ApiOkResponse({ description: 'Order detail' })
  @ApiNotFoundResponse({ description: 'Order not found or belongs to a different distributor' })
  getOrder(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.getOrder(id, distributorId);
  }

  @Post('orders/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a submitted order' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'ID of the user performing the action' })
  @ApiOkResponse({ description: 'Order accepted' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiUnprocessableEntityResponse({ description: 'Order is not in SUBMITTED status' })
  acceptOrder(
    @Headers('x-distributor-id') distributorId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.acceptOrder(id, distributorId, userId);
  }

  @Post('orders/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a submitted order' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'ID of the user performing the action' })
  @ApiOkResponse({ description: 'Order rejected' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiUnprocessableEntityResponse({ description: 'Order is not in SUBMITTED status' })
  rejectOrder(
    @Headers('x-distributor-id') distributorId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.service.rejectOrder(id, distributorId, userId, dto.reason);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order (SUBMITTED or ACCEPTED)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'ID of the user performing the action' })
  @ApiOkResponse({ description: 'Order cancelled' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiUnprocessableEntityResponse({ description: 'Order cannot be cancelled in its current state' })
  cancelOrder(
    @Headers('x-distributor-id') distributorId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.service.cancelOrder(id, distributorId, userId, dto.reason);
  }
}
