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
import { AdminOrdersService } from './admin-orders.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@Controller('admin')
export class AdminOrdersController {
  constructor(private readonly service: AdminOrdersService) {}

  @Get('orders')
  listOrders(
    @Headers('x-distributor-id') distributorId: string,
    @Query() query: OrderQueryDto,
  ) {
    return this.service.listOrders(distributorId, query);
  }

  @Get('orders/:id')
  getOrder(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.getOrder(id, distributorId);
  }

  @Post('orders/:id/accept')
  @HttpCode(HttpStatus.OK)
  acceptOrder(
    @Headers('x-distributor-id') distributorId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.acceptOrder(id, distributorId, userId);
  }

  @Post('orders/:id/reject')
  @HttpCode(HttpStatus.OK)
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
  cancelOrder(
    @Headers('x-distributor-id') distributorId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.service.cancelOrder(id, distributorId, userId, dto.reason);
  }
}
