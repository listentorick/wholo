import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';

interface RequestWithUser extends Request {
  user: { organisationId: string };
}

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Query('distributorSlug') distributorSlug: string, @Req() req: RequestWithUser) {
    return this.cartService.getCart(distributorSlug, req.user.organisationId);
  }

  @Put('items')
  upsertItem(@Body() dto: UpsertCartItemDto, @Req() req: RequestWithUser) {
    return this.cartService.upsertItem(dto, req.user.organisationId);
  }
}
