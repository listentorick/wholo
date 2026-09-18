import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

export class SubmitOrderDto {
  @IsString()
  distributorSlug: string;

  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  requestedDeliveryDate: string;
}

interface RequestWithUser extends Request {
  user: { token: string; organisationId: string };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  submitOrder(@Body() dto: SubmitOrderDto, @Req() req: RequestWithUser) {
    const { token } = req.user;
    return this.ordersService.submitOrder(dto, token);
  }

  @Get()
  listOrders(@Query() query: Record<string, string>, @Req() req: RequestWithUser) {
    const { token, organisationId } = req.user;
    return this.ordersService.listOrders(organisationId, query, token);
  }

  @Get(':id')
  getOrder(@Param('id') id: string, @Req() req: RequestWithUser) {
    const { token } = req.user;
    return this.ordersService.getOrder(id, token);
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithUser) {
    const { token } = req.user;
    return this.ordersService.cancelOrder(id, body, token);
  }
}
