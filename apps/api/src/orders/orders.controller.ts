import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ORDER_AS_CONTEXT_KEY, OrderAsContext } from '../order-as/order-as.interceptor';
import {
  ApiBearerAuth, ApiTags, ApiOperation,
  ApiOkResponse, ApiCreatedResponse, ApiNotFoundResponse,
  ApiBadRequestResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { SubmitOrderDto } from './dto/submit-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new order' })
  @ApiCreatedResponse({ description: 'Order submitted successfully' })
  @ApiBadRequestResponse({ description: 'Invalid order data' })
  submitOrder(@Body() dto: SubmitOrderDto, @Req() req: RequestWithUser) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const customerId = orderAs?.customerId ?? req.user.organisationId;
    return this.ordersService.submitOrder(dto, req.user.sub, customerId, orderAs?.sessionToken, orderAs?.distributorId);
  }

  @Get()
  @ApiOperation({ summary: 'List orders for the authenticated trade customer' })
  @ApiOkResponse({ description: 'Paginated list of orders' })
  listOrders(@Query() query: OrderQueryDto, @Req() req: RequestWithUser) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const customerId = orderAs?.customerId ?? req.user.organisationId;
    return this.ordersService.listCustomerOrders(customerId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single order' })
  @ApiOkResponse({ description: 'Order detail' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  getOrder(@Param('id') id: string, @Req() req: RequestWithUser) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const customerId = orderAs?.customerId ?? req.user.organisationId;
    return this.ordersService.getCustomerOrder(id, customerId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiOkResponse({ description: 'Order cancelled' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiUnprocessableEntityResponse({ description: 'Order cannot be cancelled in its current state' })
  cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @Req() req: RequestWithUser,
  ) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const customerId = orderAs?.customerId ?? req.user.organisationId;
    return this.ordersService.cancelCustomerOrder(id, customerId, dto.reason);
  }
}
