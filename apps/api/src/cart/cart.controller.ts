import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';
import { ORDER_AS_CONTEXT_KEY, OrderAsContext } from '../order-as/order-as.interceptor';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current cart for a distributor' })
  @ApiOkResponse({ description: 'Cart contents with line items' })
  getCart(@Query('distributorSlug') distributorSlug: string, @Req() req: RequestWithUser) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const customerId = orderAs?.customerId ?? req.user.organisationId;
    return this.cartService.getCart(distributorSlug, customerId, req.user.sub);
  }

  @Put('items')
  @ApiOperation({ summary: 'Add or update a cart item (quantity 0 removes the item)' })
  @ApiOkResponse({ description: 'Updated cart' })
  upsertItem(@Body() dto: UpsertCartItemDto, @Req() req: RequestWithUser) {
    const orderAs = (req as any)[ORDER_AS_CONTEXT_KEY] as OrderAsContext | undefined;
    const customerId = orderAs?.customerId ?? req.user.organisationId;
    return this.cartService.upsertItem(dto, customerId, req.user.sub);
  }
}
