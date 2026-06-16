import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  find(@Req() req: Request) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.find(organisationId);
  }

  @Patch()
  update(@Req() req: Request, @Body() dto: UpdateSettingsDto) {
    const { organisationId } = req.user as { organisationId: string };
    return this.service.update(organisationId, dto);
  }
}
