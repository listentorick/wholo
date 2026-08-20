import {
  Body, Controller, Get, Param, Patch, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryRunsService } from './delivery-runs.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderSchedulingController {
  constructor(private service: DeliveryRunsService) {}

  @Get(':orderId/reschedule-preview')
  getReschedulePreview(@Req() req: Request, @Param('orderId') orderId: string, @Query('date') date: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.getReschedulePreview(organisationId, orderId, date, token);
  }

  @Patch(':orderId/scheduled-delivery-date')
  changeScheduledDeliveryDate(@Req() req: Request, @Param('orderId') orderId: string, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.changeScheduledDeliveryDate(organisationId, orderId, body, token);
  }
}
