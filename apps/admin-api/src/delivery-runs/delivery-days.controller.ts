import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryRunsService } from './delivery-runs.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-days')
export class DeliveryDaysController {
  constructor(private service: DeliveryRunsService) {}

  @Get()
  listDays(@Req() req: Request, @Query() query: Record<string, string>) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.listDays(organisationId, query, token);
  }

  @Get(':date')
  getDay(@Req() req: Request, @Param('date') date: string) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.getDay(organisationId, date, token);
  }
}
