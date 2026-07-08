import { Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingService } from './accounting.service';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('connection')
  async getConnection(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    const connection = await this.service.getConnection(organisationId, token);
    if (connection === undefined) {
      res.status(204);
      return undefined;
    }
    return connection;
  }

  @Post('connections/xero/authorization-url')
  createXeroAuthorizationUrl(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.createXeroAuthorizationUrl(organisationId, token);
  }

  @Delete('connection')
  disconnect(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.disconnect(organisationId, token);
  }
}
