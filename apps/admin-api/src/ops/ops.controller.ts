import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OpenSupportAccessDto } from './dto/open-support-access.dto';
import { OpsService } from './ops.service';

type OpsUser = { sub: string; token: string };

/** The Ops app's own endpoints. Only registered when APP_MODE=ops. */
@UseGuards(JwtAuthGuard)
@Controller('ops')
export class OpsController {
  constructor(private opsService: OpsService) {}

  @Get('stats')
  stats(@Req() req: Request) {
    return this.opsService.stats((req.user as OpsUser).token);
  }

  @Get('distributors')
  distributors(@Req() req: Request, @Query('q') q?: string, @Query('filter') filter?: string) {
    return this.opsService.distributors((req.user as OpsUser).token, { q, filter });
  }

  @Get('grants')
  myGrants(@Req() req: Request) {
    const { sub, token } = req.user as OpsUser;
    return this.opsService.myGrants(sub, token);
  }

  @Post('grants')
  openAccess(@Req() req: Request, @Body() dto: OpenSupportAccessDto) {
    const { sub, token } = req.user as OpsUser;
    return this.opsService.openAccess(sub, dto, token);
  }

  @Delete('grants/:distributorId/:grantId')
  endAccess(@Req() req: Request, @Param('distributorId') distributorId: string, @Param('grantId') grantId: string) {
    return this.opsService.endAccess(distributorId, grantId, (req.user as OpsUser).token);
  }
}
