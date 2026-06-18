import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

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
    return this.cartService.getCart(distributorSlug, req.user.organisationId, req.user.sub);
  }

  @Put('items')
  @ApiOperation({ summary: 'Add or update a cart item (quantity 0 removes the item)' })
  @ApiOkResponse({ description: 'Updated cart' })
  upsertItem(@Body() dto: UpsertCartItemDto, @Req() req: RequestWithUser) {
    return this.cartService.upsertItem(dto, req.user.organisationId, req.user.sub);
  }
}
