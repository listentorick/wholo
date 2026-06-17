import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryService } from './delivery.service';

@Controller('delivery')
@UseGuards(JwtAuthGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('available-dates')
  getAvailableDates(@Query('distributorSlug') distributorSlug: string, @Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.deliveryService.getAvailableDates(distributorSlug, token);
  }
}
