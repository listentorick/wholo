import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';
import { ActingCustomerId, OrderAsSession } from '../order-as/acting-customer.decorator';
import { OrderAsContext } from '../order-as/order-as.interceptor';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('distributors/:distributorId/cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current cart for a distributor' })
  @ApiOkResponse({ description: 'Cart contents with line items' })
  getCart(
    @Param('distributorId') distributorId: string,
    @ActingCustomerId() customerId: string,
    @OrderAsSession() orderAs: OrderAsContext | undefined,
    @Req() req: RequestWithUser,
  ) {
    return this.cartService.getCart(distributorId, customerId, req.user.sub, orderAs?.distributorId);
  }

  @Put('items')
  @ApiOperation({ summary: 'Add or update a cart item (quantity 0 removes the item)' })
  @ApiOkResponse({ description: 'Updated cart' })
  upsertItem(
    @Param('distributorId') distributorId: string,
    @Body() dto: UpsertCartItemDto,
    @ActingCustomerId() customerId: string,
    @OrderAsSession() orderAs: OrderAsContext | undefined,
    @Req() req: RequestWithUser,
  ) {
    return this.cartService.upsertItem(distributorId, dto, customerId, req.user.sub, orderAs?.distributorId);
  }
}
