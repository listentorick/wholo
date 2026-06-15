import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Query('distributorSlug') distributorSlug: string, @Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.cartService.getCart(distributorSlug, token);
  }

  @Put('items')
  upsertItem(@Body() body: unknown, @Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.cartService.upsertItem(body, token);
  }
}
