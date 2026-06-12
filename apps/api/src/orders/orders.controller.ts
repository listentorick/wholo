import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { SubmitOrderDto } from './dto/submit-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  submitOrder(@Body() dto: SubmitOrderDto, @Req() req: RequestWithUser) {
    return this.ordersService.submitOrder(dto, req.user.sub, req.user.organisationId);
  }

  @Get()
  listOrders(@Query() query: OrderQueryDto, @Req() req: RequestWithUser) {
    return this.ordersService.listCustomerOrders(req.user.organisationId, query);
  }

  @Get(':id')
  getOrder(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.ordersService.getCustomerOrder(id, req.user.organisationId);
  }

  @Post(':id/cancel')
  cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @Req() req: RequestWithUser,
  ) {
    return this.ordersService.cancelCustomerOrder(id, req.user.organisationId, dto.reason);
  }
}
