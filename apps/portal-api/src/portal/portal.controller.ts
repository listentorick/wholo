import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me/distributors')
  getMyDistributors(@Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.portalService.getMyDistributors(token);
  }

  @Get('me/profile')
  getMyProfile(@Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.portalService.getMyProfile(token);
  }

  @Patch('me/profile')
  updateMyProfile(@Req() req: Request, @Body() body: unknown) {
    const { token } = req['user'] as { token: string };
    return this.portalService.updateMyProfile(token, body);
  }
}
