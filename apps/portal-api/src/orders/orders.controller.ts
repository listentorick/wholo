import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  submitOrder(@Body() body: unknown, @Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.ordersService.submitOrder(body, token);
  }

  @Get()
  listOrders(@Query() query: Record<string, string>, @Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.ordersService.listOrders(query, token);
  }

  @Get(':id')
  getOrder(@Param('id') id: string, @Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.ordersService.getOrder(id, token);
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.ordersService.cancelOrder(id, body, token);
  }
}
