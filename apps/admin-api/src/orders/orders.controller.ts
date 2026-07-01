import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  listOrders(@Query() query: OrderQueryDto, @Req() req: Request) {
    const { organisationId, token } = req['user'] as { organisationId: string; token: string };
    return this.ordersService.listOrders(organisationId, query, token);
  }

  @Get(':id')
  getOrder(@Param('id') id: string, @Req() req: Request) {
    const { organisationId, token } = req['user'] as { organisationId: string; token: string };
    return this.ordersService.getOrder(id, organisationId, token);
  }

  @Post(':id/accept')
  acceptOrder(@Param('id') id: string, @Req() req: Request) {
    const { organisationId, token } = req['user'] as { organisationId: string; token: string };
    return this.ordersService.acceptOrder(id, organisationId, token);
  }

  @Post(':id/reject')
  rejectOrder(@Param('id') id: string, @Body() dto: RejectOrderDto, @Req() req: Request) {
    const { organisationId, token } = req['user'] as { organisationId: string; token: string };
    return this.ordersService.rejectOrder(id, organisationId, dto, token);
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string, @Body() dto: CancelOrderDto, @Req() req: Request) {
    const { organisationId, token } = req['user'] as { organisationId: string; token: string };
    return this.ordersService.cancelOrder(id, organisationId, dto, token);
  }
}
